from typing import Optional

from pydantic import BaseModel


class ChangeOrderTypeBreakdown(BaseModel):
    key: str
    label: str
    count: int
    total: float
    pct: int


class SpendCategory(BaseModel):
    code: str
    total: float
    count: int


class ProjectPerformance(BaseModel):
    project_id: str
    project_name: str
    contract_value: float
    co_total: float
    co_count: int
    status: str


class ScorecardItem(BaseModel):
    key: str
    label: str
    value: str
    target: str
    status: str


class SubcontractorCompliance(BaseModel):
    id: str
    company_name: str
    trade: Optional[str] = None
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    w9_on_file: bool
    insurance_expiry: Optional[str] = None
    insurance_status: str
    rating: Optional[int] = None
    preferred: bool


class SubIntelligenceSummary(BaseModel):
    avg_project_value: float
    project_count: int
    overall_margin: int
    co_approval_rate: int
    co_approved_count: int
    co_total_count: int
    co_total_value: float
    co_breakdown: list[ChangeOrderTypeBreakdown]
    spend_by_category: list[SpendCategory]
    project_performance: list[ProjectPerformance]
    scorecard: list[ScorecardItem]
    subcontractors: list[SubcontractorCompliance]
