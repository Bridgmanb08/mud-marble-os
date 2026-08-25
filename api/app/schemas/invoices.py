from typing import Optional

from pydantic import BaseModel


class InvoiceCreate(BaseModel):
    project_id: str
    invoice_number: Optional[str] = None
    invoice_type: str = "progress"
    amount_due: float = 0
    due_date: Optional[str] = None
    notes_external: Optional[str] = None


class InvoiceUpdate(BaseModel):
    status: Optional[str] = None
    amount_paid: Optional[float] = None
    invoice_number: Optional[str] = None
    invoice_type: Optional[str] = None
    amount_due: Optional[float] = None
    due_date: Optional[str] = None
    notes_external: Optional[str] = None


class ProjectBrief(BaseModel):
    name: str


class InvoiceOut(BaseModel):
    id: str
    project_id: str
    invoice_number: Optional[str] = None
    invoice_type: str
    amount_due: float
    amount_paid: Optional[float] = None
    due_date: Optional[str] = None
    notes_external: Optional[str] = None
    status: str
    issued_at: Optional[str] = None
    created_at: str
    projects: Optional[ProjectBrief] = None


class CostCodeBrief(BaseModel):
    code: str
    name: str


class InvoiceLineItemCreate(BaseModel):
    source_line_item_id: Optional[str] = None
    cost_code_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    pct_of_line_item: Optional[float] = None
    amount: float = 0
    sort_order: int = 0


class InvoiceLineItemBulkCreate(BaseModel):
    items: list[InvoiceLineItemCreate]


class InvoiceLineItemUpdate(BaseModel):
    title: Optional[str] = None
    cost_code_id: Optional[str] = None
    description: Optional[str] = None
    pct_of_line_item: Optional[float] = None
    amount: Optional[float] = None
    sort_order: Optional[int] = None


class InvoiceLineItemOut(BaseModel):
    id: str
    invoice_id: str
    source_line_item_id: Optional[str] = None
    cost_code_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    pct_of_line_item: Optional[float] = None
    amount: float
    sort_order: int
    created_at: str
    cost_codes: Optional[CostCodeBrief] = None


# "Estimate Line Items" for the BuilderTrend-style Add-from-Estimate picker --
# each row from the project's current estimate, annotated with how much of
# it has already been invoiced across every invoice for this project (not
# just the one currently being built), so the picker can show a progress bar
# and cap what's left to invoice. Computed live, not stored -- same
# derive-don't-store convention used throughout this app (lease_status,
# equity, is_late, etc.).
class EstimateItemForInvoiceOut(BaseModel):
    id: str
    title: str
    cost_code_id: Optional[str] = None
    cost_codes: Optional[CostCodeBrief] = None
    cost_type: str
    owner_price: float
    notes_external: Optional[str] = None
    invoiced_amount: float
    invoiced_pct: float
    remaining_amount: float
