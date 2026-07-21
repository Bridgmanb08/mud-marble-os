from typing import Optional

from pydantic import BaseModel


class QuickReminderCreate(BaseModel):
    message: str
    assigned_to: Optional[str] = None  # app_users.id; None = whole-team reminder
    project_id: Optional[str] = None


class QuickReminderOut(BaseModel):
    id: str
    created_by: str
    assigned_to: Optional[str] = None
    project_id: Optional[str] = None
    message: str
    is_done: bool
    created_at: str
    dismissed_at: Optional[str] = None
