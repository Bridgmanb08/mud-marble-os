from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user
from ..schemas.quick_reminders import QuickReminderCreate, QuickReminderOut
from ..supabase_client import db_delete, db_get, db_patch, db_post

router = APIRouter(prefix="/quick-reminders", tags=["quick-reminders"])


@router.get("", response_model=list[QuickReminderOut])
async def list_quick_reminders(current_user: CurrentUser = Depends(get_current_user)):
    """Active reminders that are either assigned to me or whole-team (no assignee)."""
    return await db_get(
        "quick_reminders",
        f"?is_done=eq.false&or=(assigned_to.eq.{current_user.id},assigned_to.is.null)&order=created_at.desc",
    )


@router.post("", response_model=QuickReminderOut)
async def create_quick_reminder(
    body: QuickReminderCreate, current_user: CurrentUser = Depends(get_current_user)
):
    rows = await db_post(
        "quick_reminders",
        {
            "created_by": current_user.id,
            "assigned_to": body.assigned_to,
            "project_id": body.project_id,
            "message": body.message,
        },
    )
    return rows[0]


@router.post("/{reminder_id}/done", response_model=QuickReminderOut)
async def complete_quick_reminder(reminder_id: str, _: CurrentUser = Depends(get_current_user)):
    rows = await db_patch(
        "quick_reminders",
        reminder_id,
        {"is_done": True, "dismissed_at": datetime.now(timezone.utc).isoformat()},
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return rows[0]


@router.delete("/{reminder_id}")
async def delete_quick_reminder(reminder_id: str, _: CurrentUser = Depends(get_current_user)):
    await db_delete("quick_reminders", reminder_id)
    return {"ok": True}
