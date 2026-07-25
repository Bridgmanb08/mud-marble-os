import urllib.parse
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, require_admin
from ..schemas.files import DownloadUrlResponse
from ..schemas.messages import MessageOut, MessageThreadOut, SendMessageRequest
from ..schemas.sms_contacts import SmsContactOut, SmsContactUpsert
from ..storage_client import create_signed_download_url
from ..supabase_client import db_get, db_patch, db_patch_query, db_post
from ..twilio_client import fetch_message, send_sms

router = APIRouter(prefix="/messages", tags=["messages"])

BUCKET = "project-files"


def _normalize_phone(phone: str) -> str:
    return "".join(c for c in phone if c.isdigit())[-10:]


def _to_message_out(row: dict) -> MessageOut:
    project = row.get("projects") or {}
    sender = row.get("app_users") or {}
    return MessageOut(
        id=row["id"],
        phone_number=row["phone_number"],
        direction=row["direction"],
        body=row.get("body"),
        message_sid=row.get("message_sid"),
        status=row.get("status"),
        error_code=row.get("error_code"),
        project_id=row.get("project_id"),
        project_name=(project.get("name") or "").split("|")[0].strip() or None if project else None,
        sent_by=row.get("sent_by"),
        sent_by_name=sender.get("name") if sender else None,
        storage_path=row.get("storage_path"),
        mime_type=row.get("mime_type"),
        file_type=row.get("file_type"),
        error=row.get("error"),
        created_at=row["created_at"],
    )


@router.get("/threads", response_model=list[MessageThreadOut])
async def list_threads(_: CurrentUser = Depends(require_admin)):
    messages = await db_get("sms_messages", "?order=created_at.desc&limit=2000")
    subs = await db_get("subcontractors", "?select=company_name,trade,phone")
    subs_by_phone = {_normalize_phone(s["phone"]): s for s in subs if s.get("phone")}
    contacts = await db_get("sms_contacts", "?select=*")
    contacts_by_phone = {_normalize_phone(c["phone_number"]): c for c in contacts}
    pending = await db_get("inbound_media", "?status=eq.awaiting_reply&select=from_phone")

    pending_counts: dict = {}
    for p in pending:
        key = _normalize_phone(p["from_phone"])
        pending_counts[key] = pending_counts.get(key, 0) + 1

    threads: dict = {}
    for m in messages:
        phone = m["phone_number"]
        if phone not in threads:
            norm = _normalize_phone(phone)
            sub = subs_by_phone.get(norm)
            contact = contacts_by_phone.get(norm)
            threads[phone] = MessageThreadOut(
                phone_number=phone,
                contact_name=(contact.get("name") if contact else None) or (sub["company_name"] if sub else None),
                contact_trade=sub.get("trade") if sub else None,
                contact_id=contact.get("id") if contact else None,
                linked_subcontractor_id=contact.get("subcontractor_id") if contact else None,
                linked_project_id=contact.get("project_id") if contact else None,
                last_body=m.get("body") or ("📷 Media" if m.get("storage_path") else None),
                last_direction=m["direction"],
                last_created_at=m["created_at"],
                message_count=0,
                pending_media_count=pending_counts.get(norm, 0),
            )
        threads[phone].message_count += 1

    return sorted(threads.values(), key=lambda t: t.last_created_at, reverse=True)


@router.put("/threads/{phone}/contact", response_model=SmsContactOut)
async def upsert_contact(phone: str, body: SmsContactUpsert, _: CurrentUser = Depends(require_admin)):
    phone_q = urllib.parse.quote(phone, safe="")
    payload = {
        "name": body.name.strip() if body.name and body.name.strip() else None,
        "subcontractor_id": body.subcontractor_id,
        "project_id": body.project_id,
    }
    existing = await db_get("sms_contacts", f"?phone_number=eq.{phone_q}&limit=1")
    if existing:
        rows = await db_patch_query("sms_contacts", f"?phone_number=eq.{phone_q}", payload)
    else:
        rows = await db_post("sms_contacts", {"phone_number": phone, **payload})
    return rows[0]


@router.get("/threads/{phone}", response_model=list[MessageOut])
async def get_thread(phone: str, _: CurrentUser = Depends(require_admin)):
    phone_q = urllib.parse.quote(phone, safe="")
    rows = await db_get(
        "sms_messages",
        f"?phone_number=eq.{phone_q}&order=created_at.asc&select=*,projects(name),app_users(name)",
    )
    return [_to_message_out(r) for r in rows]


@router.post("/threads/{phone}/send", response_model=MessageOut)
async def send_message(phone: str, body: SendMessageRequest, user: CurrentUser = Depends(require_admin)):
    if not body.body.strip():
        raise HTTPException(status_code=400, detail="Message can't be empty")
    sid = await send_sms(phone, body.body.strip())
    rows = await db_post(
        "sms_messages",
        {
            "phone_number": phone,
            "direction": "outbound",
            "body": body.body.strip(),
            "message_sid": sid,
            "project_id": body.project_id,
            "sent_by": user.id,
        },
    )
    full = await db_get(
        "sms_messages", f"?id=eq.{rows[0]['id']}&select=*,projects(name),app_users(name)"
    )
    return _to_message_out(full[0])


@router.post("/{message_id}/refresh-status", response_model=MessageOut)
async def refresh_message_status(message_id: str, _: CurrentUser = Depends(require_admin)):
    """Pulls the message's current state straight from Twilio's API instead of waiting
    on (or trusting) an async status callback -- useful when a callback is slow, lost,
    or the message looks stuck (e.g. never advances past "queued")."""
    rows = await db_get("sms_messages", f"?id=eq.{message_id}")
    if not rows:
        raise HTTPException(status_code=404, detail="Not found")
    row = rows[0]
    if not row.get("message_sid"):
        raise HTTPException(status_code=400, detail="No Twilio message SID recorded for this message yet")
    twilio_data = await fetch_message(row["message_sid"])
    await db_patch(
        "sms_messages",
        message_id,
        {"status": twilio_data.get("status"), "error_code": twilio_data.get("error_code")},
    )
    full = await db_get(
        "sms_messages", f"?id=eq.{message_id}&select=*,projects(name),app_users(name)"
    )
    return _to_message_out(full[0])


@router.get("/{message_id}/download", response_model=DownloadUrlResponse)
async def download_message_media(message_id: str, _: CurrentUser = Depends(require_admin)):
    rows = await db_get("sms_messages", f"?id=eq.{message_id}")
    if not rows or not rows[0].get("storage_path"):
        raise HTTPException(status_code=404, detail="No media on this message")
    download_url = await create_signed_download_url(BUCKET, rows[0]["storage_path"])
    return DownloadUrlResponse(download_url=download_url)
