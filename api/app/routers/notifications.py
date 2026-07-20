from fastapi import APIRouter, Depends

from ..deps import CurrentUser, get_current_user
from ..schemas.notifications import NotificationOut
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
