from typing import Optional

from pydantic import BaseModel


class ProjectBrief(BaseModel):
    name: str


class NotificationOut(BaseModel):
    id: str
    type: str
    source_type: str
    source_id: Optional[str] = None
    project_id: Optional[str] = None
    message: str
    is_read: bool
    created_at: str
    projects: Optional[ProjectBrief] = None
