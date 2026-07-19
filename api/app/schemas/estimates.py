from typing import Optional

from pydantic import BaseModel


class EstimateCreate(BaseModel):
    project_id: str
    version: int = 1
    status: str = "draft"
    pm_fee_total: float = 0
    notes_internal: Optional[str] = None


class EstimateOut(BaseModel):
    id: str
    project_id: str
    version: int
    status: str
    pm_fee_total: Optional[float] = None
    notes_internal: Optional[str] = None
    grand_total_owner_price: Optional[float] = None
    construction_total_owner_price: Optional[float] = None
    allowance_total: Optional[float] = None
    created_at: str


class LineItemCreate(BaseModel):
    cost_code_id: Optional[str] = None
    bucket: str
    description: str
    day_labor_cost: float = 0
    material_cost: float = 0
    subcontractor_cost: float = 0
    contingency: float = 0
    builder_cost: float = 0
    markup_type: Optional[str] = None
    markup_value: float = 0
    owner_price: float = 0
    notes_internal: Optional[str] = None
    notes_external: Optional[str] = None
    sort_order: int = 0


class LineItemOut(LineItemCreate):
    id: str
    estimate_id: str
