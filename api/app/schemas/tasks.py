from typing import Optional

from pydantic import BaseModel, model_validator


def _check_date_order(scheduled_start: Optional[str], scheduled_end: Optional[str]) -> None:
    if scheduled_start and scheduled_end and scheduled_end < scheduled_start:
        raise ValueError("Due date cannot be before the start date")


class TaskCreate(BaseModel):
    project_id: Optional[str] = None
    title: str
    assigned_to: Optional[str] = None
    subcontractor_id: Optional[str] = None
    phase: Optional[str] = None
    status: str = "upcoming"
    priority: str = "normal"
    scheduled_start: Optional[str] = None
    scheduled_end: Optional[str] = None
    notes: Optional[str] = None
    is_milestone: bool = False
    is_punch_list: bool = False

    @model_validator(mode="after")
    def _validate_dates(self):
        _check_date_order(self.scheduled_start, self.scheduled_end)
        return self


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    assigned_to: Optional[str] = None
    subcontractor_id: Optional[str] = None
    phase: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    scheduled_start: Optional[str] = None
    scheduled_end: Optional[str] = None
    notes: Optional[str] = None
    is_milestone: Optional[bool] = None
    is_punch_list: Optional[bool] = None
    position: Optional[int] = None
    project_id: Optional[str] = None
    expected_version: Optional[int] = None

    @model_validator(mode="after")
    def _validate_dates(self):
        _check_date_order(self.scheduled_start, self.scheduled_end)
        return self


class ProjectBrief(BaseModel):
    name: str


class SubcontractorBrief(BaseModel):
    company_name: str
    trade: Optional[str] = None


class TaskOut(BaseModel):
    id: str
    project_id: Optional[str] = None
    title: str
    assigned_to: Optional[str] = None
    subcontractor_id: Optional[str] = None
    phase: Optional[str] = None
    status: str
    priority: str = "normal"
    position: int = 0
    scheduled_start: Optional[str] = None
    scheduled_end: Optional[str] = None
    notes: Optional[str] = None
    is_milestone: bool = False
    is_punch_list: bool = False
    version: int = 1
    created_at: str
    projects: Optional[ProjectBrief] = None
    subcontractors: Optional[SubcontractorBrief] = None
    subtask_total: int = 0
    subtask_complete: int = 0
    comment_count: int = 0
    blocked: bool = False
    overdue: bool = False


class ReorderItem(BaseModel):
    id: str
    status: str
    position: int
    expected_version: Optional[int] = None


class ReorderRequest(BaseModel):
    items: list[ReorderItem]


class BulkUpdateRequest(BaseModel):
    ids: list[str]
    status: Optional[str] = None
    assigned_to: Optional[str] = None


class BulkDeleteRequest(BaseModel):
    ids: list[str]


class SubtaskCreate(BaseModel):
    title: str


class SubtaskUpdate(BaseModel):
    title: Optional[str] = None
    is_complete: Optional[bool] = None
    position: Optional[int] = None


class SubtaskOut(BaseModel):
    id: str
    task_id: str
    title: str
    is_complete: bool
    position: int
    created_at: str


class DependencyCreate(BaseModel):
    depends_on_id: str


class DependencyOut(BaseModel):
    id: str
    task_id: str
    depends_on_id: str
    created_at: str


class CommentCreate(BaseModel):
    content: str


class CommentOut(BaseModel):
    id: str
    task_id: str
    author: str
    content: str
    created_at: str


class BoardViewCreate(BaseModel):
    name: str
    view_type: str = "kanban"
    group_by: Optional[str] = None
    filters: dict = {}
    sort_by: Optional[str] = None


class BoardViewUpdate(BaseModel):
    name: Optional[str] = None
    view_type: Optional[str] = None
    group_by: Optional[str] = None
    filters: Optional[dict] = None
    sort_by: Optional[str] = None
    position: Optional[int] = None


class BoardViewOut(BaseModel):
    id: str
    user_id: str
    name: str
    view_type: str
    group_by: Optional[str] = None
    filters: dict = {}
    sort_by: Optional[str] = None
    position: int
    created_at: str
