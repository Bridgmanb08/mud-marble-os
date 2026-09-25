from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException

from .. import email_client
from ..deps import CurrentUser, get_current_user
from ..notification_digests import build_digest, load_open_tasks
from ..notification_tick import DEFAULT_PREFS, effective_prefs
from ..schemas.notification_prefs import DigestRequest, NotificationPrefsOut, NotificationPrefsUpdate
from ..supabase_client import db_get, db_patch_query, db_post

router = APIRouter(prefix="/notification-prefs", tags=["notification-prefs"])


async def _load(current_user: CurrentUser) -> NotificationPrefsOut:
    rows = await db_get("notification_prefs", f"?user_id=eq.{current_user.id}")
    prefs = effective_prefs(rows[0] if rows else None)
    return NotificationPrefsOut(**prefs, email=current_user.email, email_configured=email_client.is_configured())


@router.get("/me", response_model=NotificationPrefsOut)
async def get_my_prefs(current_user: CurrentUser = Depends(get_current_user)):
    return await _load(current_user)


@router.patch("/me", response_model=NotificationPrefsOut)
async def update_my_prefs(body: NotificationPrefsUpdate, current_user: CurrentUser = Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if updates:
        updates["updated_at"] = datetime.utcnow().isoformat()
        existing = await db_get("notification_prefs", f"?user_id=eq.{current_user.id}&select=user_id")
        if existing:
            await db_patch_query("notification_prefs", f"?user_id=eq.{current_user.id}", updates)
        else:
            await db_post("notification_prefs", {"user_id": current_user.id, **updates})
    return await _load(current_user)


async def _digest_for(kind: str, current_user: CurrentUser):
    rows = await db_get("notification_prefs", f"?user_id=eq.{current_user.id}")
    tz = effective_prefs(rows[0] if rows else None)["timezone"]
    today = datetime.now(ZoneInfo(tz)).date()
    return build_digest(kind, current_user.id, current_user.name, await load_open_tasks(), today)


@router.post("/me/preview")
async def preview_digest(body: DigestRequest, current_user: CurrentUser = Depends(get_current_user)):
    """Shows exactly what this person's digest would contain right now, without
    sending anything -- works before an email provider is even set up."""
    digest = await _digest_for(body.kind, current_user)
    if digest is None:
        return {"empty": True, "subject": None, "html": None}
    return {"empty": False, "subject": digest.subject, "html": digest.html}


@router.post("/me/send-test")
async def send_test_digest(body: DigestRequest, current_user: CurrentUser = Depends(get_current_user)):
    if not email_client.is_configured():
        raise HTTPException(status_code=503, detail="Email sending is not set up yet.")
    digest = await _digest_for(body.kind, current_user)
    if digest is None:
        raise HTTPException(status_code=400, detail="Nothing is due for you right now, so there is nothing to email.")
    error = await email_client.send_email(current_user.email, digest.subject, digest.html, digest.text)
    if error:
        raise HTTPException(status_code=502, detail=error)
    return {"ok": True, "to": current_user.email}
