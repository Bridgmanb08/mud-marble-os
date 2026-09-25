from typing import Optional

from pydantic import BaseModel, model_validator

from ..schema_validators import forbid_null


class ProjectBrief(BaseModel):
    name: str
    address: Optional[str] = None
    status: Optional[str] = None


class EstimateCreate(BaseModel):
    project_id: str
    version: int = 1
    status: str = "draft"
    title: Optional[str] = None
    pm_fee_total: float = 0
    notes_internal: Optional[str] = None
    approval_deadline: Optional[str] = None
    introductory_text: Optional[str] = None
    closing_text: Optional[str] = None


class EstimateUpdate(BaseModel):
    status: Optional[str] = None
    title: Optional[str] = None
    pm_fee_total: Optional[float] = None
    notes_internal: Optional[str] = None
    approval_deadline: Optional[str] = None
    introductory_text: Optional[str] = None
    closing_text: Optional[str] = None
    sent_at: Optional[str] = None
    is_archived: Optional[bool] = None

    @model_validator(mode="after")
    def _validate_no_null_required(self):
        forbid_null(self, {"status", "is_archived"})
        return self


class EstimateOut(BaseModel):
    id: str
    project_id: str
    version: int
    status: str
    title: Optional[str] = None
    pm_fee_total: Optional[float] = None
    notes_internal: Optional[str] = None
    approval_deadline: Optional[str] = None
    introductory_text: Optional[str] = None
    closing_text: Optional[str] = None
    sent_at: Optional[str] = None
    last_viewed_at: Optional[str] = None
    grand_total_owner_price: Optional[float] = None
    construction_total_owner_price: Optional[float] = None
    allowance_total: Optional[float] = None
    is_archived: Optional[bool] = None
    created_at: str
    projects: Optional[ProjectBrief] = None


class CostCodeBrief(BaseModel):
    code: str
    name: str


class LineItemCreate(BaseModel):
    cost_code_id: Optional[str] = None
    group_name: Optional[str] = None
    bucket: str = "construction"
    title: str
    description: Optional[str] = None
    # Negative quantity/unit_cost/markup are all allowed on purpose -- a scope
    # reduction or credit is a legitimate negative line (and a negative change
    # order is built from negative line items), so nothing here clamps to >= 0.
    quantity: float = 1
    unit: Optional[str] = None
    unit_cost: float = 0
    cost_type: str = "none"
    markup_type: str = "percent"
    markup_value: float = 0
    estimated_days: Optional[float] = None
    notes_internal: Optional[str] = None
    notes_external: Optional[str] = None
    sort_order: int = 0


class LineItemUpdate(BaseModel):
    cost_code_id: Optional[str] = None
    group_name: Optional[str] = None
    bucket: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    unit_cost: Optional[float] = None
    cost_type: Optional[str] = None
    markup_type: Optional[str] = None
    markup_value: Optional[float] = None
    estimated_days: Optional[float] = None
    notes_internal: Optional[str] = None
    notes_external: Optional[str] = None
    sort_order: Optional[int] = None

    @model_validator(mode="after")
    def _validate_no_null_required(self):
        forbid_null(
            self, {"bucket", "title", "quantity", "unit_cost", "cost_type", "markup_type", "markup_value", "sort_order"}
        )
        return self


class LineItemOut(BaseModel):
    id: str
    # Exactly one of these is set -- an item belongs to an estimate OR a change order.
    estimate_id: Optional[str] = None
    change_order_id: Optional[str] = None
    cost_code_id: Optional[str] = None
    group_name: Optional[str] = None
    bucket: str
    title: str
    description: Optional[str] = None
    quantity: float
    unit: Optional[str] = None
    unit_cost: float
    cost_type: str
    builder_cost: float
    markup_type: str
    markup_value: float
    owner_price: float
    estimated_days: Optional[float] = None
    notes_internal: Optional[str] = None
    notes_external: Optional[str] = None
    sort_order: int
    cost_codes: Optional[CostCodeBrief] = None


class LineItemReference(BaseModel):
    id: str
    estimate_id: str
    project_name: Optional[str] = None
    title: str
    description: Optional[str] = None
    quantity: float
    unit: Optional[str] = None
    unit_cost: float
    cost_type: str
    builder_cost: float
    markup_type: str
    markup_value: float
    owner_price: float
    estimated_days: Optional[float] = None
    notes_internal: Optional[str] = None
    notes_external: Optional[str] = None
    created_at: str
