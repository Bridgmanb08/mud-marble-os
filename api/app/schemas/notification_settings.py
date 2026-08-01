from typing import Optional

from pydantic import BaseModel


class NotificationSettingsOut(BaseModel):
    id: str
    smart_learning_enabled: bool
    updated_at: str
    updated_by: Optional[str] = None


class NotificationSettingsUpdate(BaseModel):
    smart_learning_enabled: Optional[bool] = None
