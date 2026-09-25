from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..deps import CurrentUser, get_current_user
from ..notification_digests import read_action_token
from ..schemas.notifications import NotificationOut
from ..schemas.tasks import TaskUpdate
from ..supabase_client import db_get, db_patch, db_patch_query

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
async def list_notifications(current_user: CurrentUser = Depends(get_current_user)):
    return await db_get(
        "notifications",
        f"?user_id=eq.{current_user.id}&order=created_at.desc&limit=30&select=*,projects(name)",
    )


@router.post("/{notification_id}/read")
async def mark_notification_read(notification_id: str, _: CurrentUser = Depends(get_current_user)):
    await db_patch("notifications", notification_id, {"is_read": True})
    return {"ok": True}


@router.post("/mark-all-read")
async def mark_all_notifications_read(current_user: CurrentUser = Depends(get_current_user)):
    await db_patch_query(
        "notifications", f"?user_id=eq.{current_user.id}&is_read=eq.false", {"is_read": True}
    )
    return {"ok": True}


# The two endpoints below back the "Mark complete" / "Move to tomorrow"
# buttons in digest emails. They are deliberately NOT behind the login cookie
# (someone tapping an email link on a phone may not be signed in); the signed,
# expiring token is the credential. A GET only DESCRIBES the action -- nothing
# changes until the person confirms on the page and it POSTs, because mail
# scanners and link previews follow every link in an email.
class TaskActionRequest(BaseModel):
    token: str


def _read_token_or_400(token: str) -> dict:
    payload = read_action_token(token)
    if not payload:
        raise HTTPException(status_code=400, detail="This link has expired or is not valid. Open the task board to make the change.")
    return payload


@router.get("/task-action-info")
async def task_action_info(token: str):
    payload = _read_token_or_400(token)
    rows = await db_get("schedule_items", f"?id=eq.{payload['task']}&select=title,status,scheduled_end,projects(name)")
    if not rows:
        raise HTTPException(status_code=404, detail="That task no longer exists.")
    t = rows[0]
    return {
        "action": payload["act"],
        "title": t["title"],
        "project": (t.get("projects") or {}).get("name"),
        "already_complete": t["status"] == "complete",
    }


@router.post("/task-action")
async def task_action(body: TaskActionRequest):
    from .tasks import update_task  # local import: tasks imports this package's siblings

    payload = _read_token_or_400(body.token)
    users = await db_get("app_users", f"?id=eq.{payload['sub']}&select=id,email,name,role,is_admin")
    if not users:
        raise HTTPException(status_code=404, detail="That account no longer exists.")
    user = CurrentUser(**users[0])
    rows = await db_get("schedule_items", f"?id=eq.{payload['task']}&select=status,scheduled_start,scheduled_end")
    if not rows:
        raise HTTPException(status_code=404, detail="That task no longer exists.")
    current = rows[0]

    if payload["act"] == "complete":
        if current["status"] == "complete":
            return {"ok": True, "message": "Already marked complete."}
        await update_task(payload["task"], TaskUpdate(status="complete"), current_user=user)
        return {"ok": True, "message": "Marked complete."}

    prefs = await db_get("notification_prefs", f"?user_id=eq.{user.id}&select=timezone")
    tz = (prefs[0]["timezone"] if prefs else None) or "America/Indianapolis"
    tomorrow = (datetime.now(ZoneInfo(tz)).date() + timedelta(days=1)).isoformat()
    changes = {"scheduled_end": tomorrow}
    start = (current.get("scheduled_start") or "")[:10]
    if start and start > tomorrow:
        changes["scheduled_start"] = tomorrow
    await update_task(payload["task"], TaskUpdate(**changes), current_user=user)
    return {"ok": True, "message": "Moved to tomorrow."}
