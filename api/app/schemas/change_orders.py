from typing import Optional

from pydantic import BaseModel, Field


class ChangeOrderCreate(BaseModel):
    project_id: str
    title: str
    co_type: str = "client_addition"
    owner_price: float = 0
    builder_cost: float = 0
    description: Optional[str] = None
    notes_internal: Optional[str] = None
    discovered_by: Optional[str] = None


class ChangeOrderUpdate(BaseModel):
    status: Optional[str] = None
    sent_at: Optional[str] = None
    title: Optional[str] = None
    co_type: Optional[str] = None
    owner_price: Optional[float] = None
    builder_cost: Optional[float] = None
    description: Optional[str] = None
    notes_internal: Optional[str] = None
    discovered_by: Optional[str] = None


class ProjectBrief(BaseModel):
    name: str
    address: Optional[str] = None


class ChangeOrderOut(BaseModel):
    id: str
    project_id: str
    co_number: Optional[int] = None
    title: str
    co_type: str
    owner_price: float
    builder_cost: Optional[float] = None
    description: Optional[str] = None
    notes_internal: Optional[str] = None
    discovered_by: Optional[str] = None
    status: str
    sent_at: Optional[str] = None
    created_at: str
    projects: Optional[ProjectBrief] = None
    sop_breach: bool = False


class CostCodeBrief(BaseModel):
    code: str
    name: str


class ChangeOrderLineItemCreate(BaseModel):
    cost_code_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    quantity: float = Field(default=1, ge=0)
    unit: Optional[str] = None
    unit_cost: float = Field(default=0, ge=0)
    cost_type: str = "none"
    markup_type: str = "percent"
    markup_value: float = 0
    notes_internal: Optional[str] = None
    notes_external: Optional[str] = None
    sort_order: int = 0


class ChangeOrderLineItemUpdate(BaseModel):
    cost_code_id: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    quantity: Optional[float] = Field(default=None, ge=0)
    unit: Optional[str] = None
    unit_cost: Optional[float] = Field(default=None, ge=0)
    cost_type: Optional[str] = None
    markup_type: Optional[str] = None
    markup_value: Optional[float] = None
    notes_internal: Optional[str] = None
    notes_external: Optional[str] = None
    sort_order: Optional[int] = None


class ChangeOrderLineItemOut(ChangeOrderLineItemCreate):
    id: str
    change_order_id: str
    builder_cost: float
    owner_price: float
    cost_codes: Optional[CostCodeBrief] = None
    created_at: str
