from typing import Optional

from pydantic import BaseModel


class TaskCreate(BaseModel):
    project_id: Optional[str] = None
    title: str
    assigned_to: Optional[str] = None
    phase: Optional[str] = None
    status: str = "upcoming"
    priority: str = "normal"
    scheduled_start: Optional[str] = None
    scheduled_end: Optional[str] = None
    notes: Optional[str] = None
    is_milestone: bool = False


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    assigned_to: Optional[str] = None
    phase: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    scheduled_start: Optional[str] = None
    scheduled_end: Optional[str] = None
    notes: Optional[str] = None
    is_milestone: Optional[bool] = None
    position: Optional[int] = None
    project_id: Optional[str] = None


class ProjectBrief(BaseModel):
    name: str


class TaskOut(BaseModel):
    id: str
    project_id: Optional[str] = None
    title: str
    assigned_to: Optional[str] = None
    phase: Optional[str] = None
    status: str
    priority: str = "normal"
    position: int = 0
    scheduled_start: Optional[str] = None
    scheduled_end: Optional[str] = None
    notes: Optional[str] = None
    is_milestone: bool = False
    created_at: str
    projects: Optional[ProjectBrief] = None
    subtask_total: int = 0
    subtask_complete: int = 0
    comment_count: int = 0
    blocked: bool = False


class ReorderItem(BaseModel):
    id: str
    status: str
    position: int


class ReorderRequest(BaseModel):
    items: list[ReorderItem]
