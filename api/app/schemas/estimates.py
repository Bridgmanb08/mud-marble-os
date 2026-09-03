from typing import Optional

from pydantic import BaseModel, Field, model_validator

from ..schema_validators import forbid_null


class ProjectBrief(BaseModel):
    name: str
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

    @model_validator(mode="after")
    def _validate_no_null_required(self):
        forbid_null(self, {"status"})
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
    # ge=0 -- a negative quantity/unit_cost has no physical meaning (you
    # can't have -5 sq ft of tile or a -$20 unit cost) and previously flowed
    # straight through _compute_costs into builder_cost/owner_price with
    # zero guardrail, silently shrinking the estimate total. markup_value is
    # deliberately left unbounded -- a negative flat/percent markup is a
    # legitimate real discount, not a data error.
    quantity: float = Field(default=1, ge=0)
    unit: Optional[str] = None
    unit_cost: float = Field(default=0, ge=0)
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
    quantity: Optional[float] = Field(default=None, ge=0)
    unit: Optional[str] = None
    unit_cost: Optional[float] = Field(default=None, ge=0)
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
    estimate_id: str
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
