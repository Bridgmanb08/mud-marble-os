from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException

from .. import email_client
from ..deps import CurrentUser, get_current_user
from ..notification_digests import build_digest, load_open_tasks, popup_payload
from ..notification_tick import DEFAULT_PREFS, effective_prefs
from ..schemas.notification_prefs import (
    DigestRequest,
    NotificationPrefsOut,
    NotificationPrefsUpdate,
    PopupSnooze,
    PopupTaskAction,
)
from .notifications import apply_task_action
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


# ---- In-app morning popup -------------------------------------------------
# The client decides WHEN to ask (60 seconds after the person starts working);
# the server decides WHETHER to show it. Everything that has to follow the
# person across devices -- dismissed today, snoozed until -- is stored here.

async def _popup_state(user_id: str, local_date):
    rows = await db_get(
        "digest_popup_state", f"?user_id=eq.{user_id}&kind=eq.morning&local_date=eq.{local_date.isoformat()}"
    )
    return rows[0] if rows else None


async def _save_popup_state(user_id: str, local_date, status: str, snoozed_until=None) -> None:
    body = {"status": status, "snoozed_until": snoozed_until, "updated_at": datetime.now(timezone.utc).isoformat()}
    if await _popup_state(user_id, local_date):
        await db_patch_query(
            "digest_popup_state",
            f"?user_id=eq.{user_id}&kind=eq.morning&local_date=eq.{local_date.isoformat()}",
            body,
        )
    else:
        await db_post(
            "digest_popup_state", {"user_id": user_id, "kind": "morning", "local_date": local_date.isoformat(), **body}
        )


async def _local_now(user_id: str):
    rows = await db_get("notification_prefs", f"?user_id=eq.{user_id}")
    prefs = effective_prefs(rows[0] if rows else None)
    return prefs, datetime.now(ZoneInfo(prefs["timezone"]))


@router.get("/me/popup")
async def get_popup(current_user: CurrentUser = Depends(get_current_user)):
    prefs, local = await _local_now(current_user.id)
    if not prefs["popup_enabled"]:
        return {"show": False, "reason": "disabled"}
    hh, mm = prefs["morning_time"].split(":")
    if local < local.replace(hour=int(hh), minute=int(mm), second=0, microsecond=0):
        return {"show": False, "reason": "before_time"}
    state = await _popup_state(current_user.id, local.date())
    if state and state["status"] == "dismissed":
        return {"show": False, "reason": "dismissed"}
    if state and state["status"] == "snoozed" and state.get("snoozed_until"):
        until = datetime.fromisoformat(state["snoozed_until"].replace("Z", "+00:00"))
        if until > datetime.now(timezone.utc):
            return {"show": False, "reason": "snoozed", "snoozed_until": until.isoformat()}
    payload = popup_payload(current_user.name, await load_open_tasks(), local.date())
    if payload is None:
        return {"show": False, "reason": "empty"}
    return {"show": True, **payload}


@router.post("/me/popup/snooze")
async def snooze_popup(body: PopupSnooze, current_user: CurrentUser = Depends(get_current_user)):
    _, local = await _local_now(current_user.id)
    until = datetime.now(timezone.utc) + timedelta(minutes=body.minutes)
    await _save_popup_state(current_user.id, local.date(), "snoozed", until.isoformat())
    return {"ok": True, "snoozed_until": until.isoformat()}


@router.post("/me/popup/dismiss")
async def dismiss_popup(current_user: CurrentUser = Depends(get_current_user)):
    _, local = await _local_now(current_user.id)
    await _save_popup_state(current_user.id, local.date(), "dismissed")
    return {"ok": True}


@router.post("/me/task-action")
async def popup_task_action(body: PopupTaskAction, current_user: CurrentUser = Depends(get_current_user)):
    return {"ok": True, "message": await apply_task_action(current_user, body.task_id, body.action)}
