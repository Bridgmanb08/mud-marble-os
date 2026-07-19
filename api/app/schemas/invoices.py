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
