from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user, require_admin
from ..notification_settings_store import get_or_create_notification_settings, update_notification_settings
from ..schemas.notification_settings import NotificationSettingsOut, NotificationSettingsUpdate

router = APIRouter(prefix="/notification-settings", tags=["notification-settings"])


@router.get("", response_model=NotificationSettingsOut)
async def get_settings(_: CurrentUser = Depends(get_current_user)):
    return await get_or_create_notification_settings()


@router.patch("", response_model=NotificationSettingsOut)
async def update_settings(body: NotificationSettingsUpdate, current_user: CurrentUser = Depends(require_admin)):
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    if fields.get("visit_reminder_days") is not None and fields["visit_reminder_days"] < 1:
        raise HTTPException(status_code=400, detail="visit_reminder_days must be at least 1")
    fields["updated_by"] = current_user.id
    return await update_notification_settings(fields)
