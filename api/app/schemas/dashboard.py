from typing import Optional

from pydantic import BaseModel


class ActiveProject(BaseModel):
    id: str
    name: str
    client_name: Optional[str] = None
    health_status: Optional[str] = None


class UpcomingTask(BaseModel):
    id: str
    title: str
    project_name: Optional[str] = None
    assigned_to: Optional[str] = None
    scheduled_end: Optional[str] = None


class ActivityItem(BaseModel):
    id: str
    author: Optional[str] = None
    note_type: Optional[str] = None
    project_name: Optional[str] = None
    content: str
    created_at: str


class DashboardSummary(BaseModel):
    active_project_count: int
    total_contract_value: float
    total_collected: float
    total_outstanding: float
    pct_collected: int
    open_change_orders: int
    overdue_invoices: int
    active_projects: list[ActiveProject]
    upcoming_tasks: list[UpcomingTask]
    recent_activity: list[ActivityItem]
