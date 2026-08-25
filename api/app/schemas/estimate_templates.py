from typing import Optional

from pydantic import BaseModel, Field, model_validator

from ..schema_validators import forbid_null
from .estimates import CostCodeBrief


class EstimateTemplateCreate(BaseModel):
    name: str
    category: Optional[str] = None
    description: Optional[str] = None


class EstimateTemplateUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None

    @model_validator(mode="after")
    def _validate_no_null_required(self):
        forbid_null(self, {"name"})
        return self


class EstimateTemplateOut(BaseModel):
    id: str
    name: str
    category: Optional[str] = None
    description: Optional[str] = None
    created_at: str
    updated_at: str


class TemplateLineItemCreate(BaseModel):
    cost_code_id: Optional[str] = None
    group_name: Optional[str] = None
    bucket: str = "construction"
    title: str
    description: Optional[str] = None
    # ge=0 -- see the identical LineItemCreate comment in schemas/estimates.py.
    # markup_value stays unbounded (a negative markup is a real discount).
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


class TemplateLineItemUpdate(BaseModel):
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


class TemplateLineItemOut(BaseModel):
    id: str
    template_id: str
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


class SaveAsTemplateRequest(BaseModel):
    name: str
    category: Optional[str] = None
    description: Optional[str] = None


class ApplyTemplateRequest(BaseModel):
    project_id: str


class ImportPreviewResponse(BaseModel):
    headers: list[str]
    rows: list[dict[str, str]]
    suggested_mapping: dict[str, Optional[str]]
    row_count: int


class ImportCommitRequest(BaseModel):
    name: str
    category: Optional[str] = None
    description: Optional[str] = None
    mapping: dict[str, Optional[str]]
    rows: list[dict[str, str]]


class ImportCommitResponse(BaseModel):
    template: EstimateTemplateOut
    item_count: int
    dropped: list[str]
