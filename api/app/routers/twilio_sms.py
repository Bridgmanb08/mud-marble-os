import logging
import urllib.parse
import uuid
from typing import Optional

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

logger = logging.getLogger("twilio_sms")

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


async def _log_message(
    phone_number: str,
    direction: str,
    body: Optional[str] = None,
    message_sid: Optional[str] = None,
    project_id: Optional[str] = None,
    storage_path: Optional[str] = None,
    mime_type: Optional[str] = None,
    file_type: Optional[str] = None,
    error: Optional[str] = None,
) -> None:
    """Best-effort conversation log for the Messaging Center -- never lets a logging
    failure break the actual reply to the sender."""
    try:
        await db_post(
            "sms_messages",
            {
                "phone_number": phone_number,
                "direction": direction,
                "body": body,
                "message_sid": message_sid,
                "project_id": project_id,
                "storage_path": storage_path,
                "mime_type": mime_type,
                "file_type": file_type,
                "error": error,
            },
        )
    except Exception:
        logger.exception("Failed to log sms_messages row (phone=%s, direction=%s)", phone_number, direction)


async def _reply(phone: str, message: str, project_id: Optional[str] = None) -> Response:
    await _log_message(phone, "outbound", body=message, project_id=project_id)
    return _twiml(message)


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
        logger.warning("Rejected inbound SMS webhook: signature mismatch (From=%s)", params.get("From"))
        raise HTTPException(status_code=403, detail="Invalid Twilio signature")

    from_phone = params.get("From", "")
    body = params.get("Body", "").strip()
    message_sid = params.get("MessageSid", "")
    num_media = int(params.get("NumMedia", "0") or "0")
    # Plain print (not logger.info) so this always shows in Vercel's function logs
    # regardless of the default logging level -- this line is the fastest way to
    # confirm the webhook is even being reached.
    print(f"[twilio_sms] inbound from={from_phone} sid={message_sid} num_media={num_media}")

    # Log the raw inbound message immediately, before any of the processing below runs,
    # so the Messaging Center has a record of it even if something downstream throws.
    await _log_message(from_phone, "inbound", body=body or None, message_sid=message_sid or None)

    try:
        return await _handle_inbound(from_phone, body, message_sid, num_media, params)
    except Exception:
        logger.exception("Unhandled error processing inbound SMS from %s (sid=%s)", from_phone, message_sid)
        fallback = "Sorry, something went wrong on our end filing that -- we'll take a look."
        try:
            await _notify_admins(f"SMS webhook error processing message from {from_phone} (sid={message_sid}) -- check server logs.", message_sid or from_phone)
        except Exception:
            logger.exception("Also failed to notify admins about the SMS webhook error")
        return await _reply(from_phone, fallback)


async def _handle_inbound(from_phone: str, body: str, message_sid: str, num_media: int, params: dict) -> Response:
    projects = await _active_projects()

    # Is this a reply to a pending "which project?" question from this number?
    phone_q = urllib.parse.quote(from_phone, safe="")
    pending = await db_get("inbound_media", f"?from_phone=eq.{phone_q}&status=eq.awaiting_reply&order=created_at.desc")
    if pending:
        matched = match_project(body, projects)
        if matched:
            for row in pending:
                await _resolve_to_project(row, matched["id"])
            return await _reply(from_phone, f"Got it — added to {matched['name']}.", project_id=matched["id"])
        for row in pending:
            await db_patch("inbound_media", row["id"], {"status": "needs_review"})
            await _notify_admins(f'Unrecognized project reply from {from_phone}: "{body}" — needs manual review.', row["id"])
        return await _reply(from_phone, "Thanks — I couldn't match that to a project, so I've flagged it for Brent to sort out.")

    if num_media == 0:
        return await _reply(from_phone, "Text a photo, video, or plan and I'll file it under the right project.")

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
        await _log_message(
            from_phone,
            "inbound",
            message_sid=f"{message_sid}_{i}",
            project_id=matched["id"] if matched else None,
            storage_path=storage_path,
            mime_type=mime_type,
            file_type=file_type,
        )

    if matched:
        return await _reply(from_phone, f"Added to {matched['name']}.", project_id=matched["id"])
    return await _reply(from_phone, "Which project is this for? Reply with the project name or address.")


@router.get("/inbound-media", response_model=list[InboundMediaOut])
async def list_inbound_media(from_phone: Optional[str] = None, _: CurrentUser = Depends(require_admin)):
    query = "?status=neq.resolved&order=created_at.desc"
    if from_phone:
        query += f"&from_phone=eq.{urllib.parse.quote(from_phone, safe='')}"
    return await db_get("inbound_media", query)


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
