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


class ContractorMilestone(BaseModel):
    id: str
    title: str
    project_name: Optional[str] = None
    assigned_to: Optional[str] = None
    scheduled_end: Optional[str] = None
    days_until_due: Optional[int] = None
    overdue: bool = False


class ClientCommunicationEntry(BaseModel):
    project_id: str
    project_name: str
    last_contact_at: Optional[str] = None
    days_since_contact: Optional[int] = None
    overdue: bool = False


class ChangeOrderAction(BaseModel):
    id: str
    co_number: Optional[int] = None
    title: str
    project_name: Optional[str] = None
    status: str
    hours_since_sent: Optional[int] = None
    sop_breach: bool = False


class ARAgingBucket(BaseModel):
    bucket: str
    total: float
    count: int


class ARAgingDetail(BaseModel):
    project_name: str
    client_name: Optional[str] = None
    amount_outstanding: float
    days_overdue: int


class ProjectProfitability(BaseModel):
    project_id: str
    project_name: str
    estimated: float
    actual_spend: float
    variance: float


class QBOSyncStatus(BaseModel):
    unsynced_count: int
    total_count: int
    most_recent_transaction_date: Optional[str] = None


class CashPosition(BaseModel):
    total_income: float
    total_expense: float
    net: float


class AlexCostTracker(BaseModel):
    month_to_date_spend: float
    monthly_target: float
    pct_of_target: int


class DesignProjectCard(BaseModel):
    project_id: str
    project_name: str
    timeline_pct: Optional[int] = None
    task_completion_pct: Optional[int] = None
    at_risk: bool = False


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
    contractor_milestones: list[ContractorMilestone]
    client_communications: list[ClientCommunicationEntry]
    change_orders_action: list[ChangeOrderAction]
    ar_aging: list[ARAgingBucket]
    ar_aging_detail: list[ARAgingDetail]
    project_profitability: list[ProjectProfitability]
    qbo_sync: QBOSyncStatus
    cash_position: CashPosition
    alex_cost: AlexCostTracker
    design_projects: list[DesignProjectCard]
