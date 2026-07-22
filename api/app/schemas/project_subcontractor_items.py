from typing import Optional

from pydantic import BaseModel


class SubItemCreate(BaseModel):
    subcontractor_id: str
    description: Optional[str] = None
    amount: float = 0
    sort_order: int = 0
    source_line_item_id: Optional[str] = None
    builder_cost: Optional[float] = None


class SubItemUpdate(BaseModel):
    description: Optional[str] = None
    amount: Optional[float] = None
    sort_order: Optional[int] = None


class SubcontractorBrief(BaseModel):
    company_name: str
    trade: Optional[str] = None


class SubItemOut(BaseModel):
    id: str
    project_id: str
    subcontractor_id: str
    description: Optional[str] = None
    amount: float
    sort_order: int
    source_line_item_id: Optional[str] = None
    builder_cost: Optional[float] = None
    created_at: str
    subcontractors: Optional[SubcontractorBrief] = None
