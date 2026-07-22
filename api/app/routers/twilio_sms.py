import urllib.parse
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response

from ..config import settings
from ..deps import CurrentUser, require_admin
from ..project_matching import match_project
from ..schemas.files import DownloadUrlResponse
from ..schemas.inbound_media import AssignProjectRequest, InboundMediaOut
from ..storage_client import create_signed_download_url, upload_object
from ..supabase_client import db_get, db_patch, db_post
from ..twilio_client import fetch_media, twiml_reply, verify_signature

router = APIRouter(tags=["twilio"])

BUCKET = "project-files"


def infer_file_type(mime: str) -> str:
    if not mime:
        return "other"
    if mime.startswith("image/"):
        return "photo"
    if mime.startswith("video/"):
        return "video"
    if mime == "application/pdf":
        return "plan"
    return "other"


def _safe_filename(name: str) -> str:
    keep = "".join(c if c.isalnum() or c in "._-" else "_" for c in name)
    return keep or "file"


def _twiml(message: str) -> Response:
    return Response(content=twiml_reply(message), media_type="application/xml")


async def _active_projects() -> list[dict]:
    return await db_get("projects", "?is_archived=eq.false&select=id,name,address,city")


async def _notify_admins(message: str, source_id: str) -> None:
    admins = await db_get("app_users", "?is_admin=eq.true&select=id")
    for a in admins:
        await db_post(
            "notifications",
            {
                "user_id": a["id"],
                "type": "unclaimed_media",
                "source_type": "inbound_media",
                "source_id": source_id,
                "project_id": None,
                "message": message,
            },
        )


async def _resolve_to_project(inbound_row: dict, project_id: str) -> None:
    rows = await db_post(
        "project_files",
        {
            "project_id": project_id,
            "file_name": _safe_filename(f"sms_{inbound_row['id']}"),
            "file_type": inbound_row["file_type"],
            "mime_type": inbound_row.get("mime_type"),
            "storage_path": inbound_row["storage_path"],
        },
    )
    await db_patch(
        "inbound_media",
        inbound_row["id"],
        {"status": "resolved", "project_id": project_id, "resolved_file_id": rows[0]["id"]},
    )


@router.post("/twilio/sms")
async def twilio_sms_webhook(request: Request):
    form = await request.form()
    params = {k: str(v) for k, v in form.items()}

    signature = request.headers.get("X-Twilio-Signature", "")
    url = f"{settings.public_base_url.rstrip('/')}/api/twilio/sms" if settings.public_base_url else str(request.url)
    if settings.twilio_auth_token and not verify_signature(url, params, signature):
        raise HTTPException(status_code=403, detail="Invalid Twilio signature")

    from_phone = params.get("From", "")
    body = params.get("Body", "").strip()
    message_sid = params.get("MessageSid", "")
    num_media = int(params.get("NumMedia", "0") or "0")

    projects = await _active_projects()

    # Is this a reply to a pending "which project?" question from this number?
    phone_q = urllib.parse.quote(from_phone, safe="")
    pending = await db_get("inbound_media", f"?from_phone=eq.{phone_q}&status=eq.awaiting_reply&order=created_at.desc")
    if pending:
        matched = match_project(body, projects)
        if matched:
            for row in pending:
                await _resolve_to_project(row, matched["id"])
            return _twiml(f"Got it — added to {matched['name']}.")
        for row in pending:
            await db_patch("inbound_media", row["id"], {"status": "needs_review"})
            await _notify_admins(f'Unrecognized project reply from {from_phone}: "{body}" — needs manual review.', row["id"])
        return _twiml("Thanks — I couldn't match that to a project, so I've flagged it for Brent to sort out.")

    if num_media == 0:
        return _twiml("Text a photo, video, or plan and I'll file it under the right project.")

    matched = match_project(body, projects)
    for i in range(num_media):
        media_url = params.get(f"MediaUrl{i}")
        if not media_url:
            continue
        mime_type = params.get(f"MediaContentType{i}", "application/octet-stream")
        content = await fetch_media(media_url)
        file_type = infer_file_type(mime_type)
        ext = mime_type.split("/")[-1] if "/" in mime_type else "bin"
        folder = matched["id"] if matched else "unassigned"
        storage_path = f"{folder}/{uuid.uuid4()}_sms.{ext}"
        await upload_object(BUCKET, storage_path, content, mime_type)

        if matched:
            await db_post(
                "project_files",
                {
                    "project_id": matched["id"],
                    "file_name": _safe_filename(f"sms_{message_sid}_{i}.{ext}"),
                    "file_type": file_type,
                    "mime_type": mime_type,
                    "size_bytes": len(content),
                    "storage_path": storage_path,
                },
            )
        else:
            await db_post(
                "inbound_media",
                {
                    "from_phone": from_phone,
                    "message_sid": f"{message_sid}_{i}",
                    "body": body or None,
                    "storage_path": storage_path,
                    "mime_type": mime_type,
                    "file_type": file_type,
                    "status": "awaiting_reply",
                },
            )

    if matched:
        return _twiml(f"Added to {matched['name']}.")
    return _twiml("Which project is this for? Reply with the project name or address.")


@router.get("/inbound-media", response_model=list[InboundMediaOut])
async def list_inbound_media(_: CurrentUser = Depends(require_admin)):
    return await db_get("inbound_media", "?status=neq.resolved&order=created_at.desc")


@router.get("/inbound-media/{item_id}/download", response_model=DownloadUrlResponse)
async def download_inbound_media(item_id: str, _: CurrentUser = Depends(require_admin)):
    rows = await db_get("inbound_media", f"?id=eq.{item_id}")
    if not rows:
        raise HTTPException(status_code=404, detail="Not found")
    download_url = await create_signed_download_url(BUCKET, rows[0]["storage_path"])
    return DownloadUrlResponse(download_url=download_url)


@router.post("/inbound-media/{item_id}/assign")
async def assign_inbound_media(item_id: str, body: AssignProjectRequest, _: CurrentUser = Depends(require_admin)):
    rows = await db_get("inbound_media", f"?id=eq.{item_id}")
    if not rows:
        raise HTTPException(status_code=404, detail="Not found")
    await _resolve_to_project(rows[0], body.project_id)
    return {"ok": True}


@router.delete("/inbound-media/{item_id}")
async def dismiss_inbound_media(item_id: str, _: CurrentUser = Depends(require_admin)):
    rows = await db_get("inbound_media", f"?id=eq.{item_id}")
    if not rows:
        raise HTTPException(status_code=404, detail="Not found")
    await db_patch("inbound_media", item_id, {"status": "resolved"})
    return {"ok": True}
