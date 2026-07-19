from typing import Optional

from pydantic import BaseModel


class TransactionCreate(BaseModel):
    project_id: str
    transaction_date: str
    vendor: Optional[str] = None
    transaction_type: str = "expense"
    amount: float
    payment_source: Optional[str] = None
    cost_code_id: Optional[str] = None
    description: Optional[str] = None
    is_allowance: bool = False
    is_change_order: bool = False
    quickbooks_synced: bool = False
    notes: Optional[str] = None


class ProjectBrief(BaseModel):
    name: str


class CostCodeBrief(BaseModel):
    code: str
    name: str


class TransactionOut(BaseModel):
    id: str
    project_id: str
    transaction_date: str
    vendor: Optional[str] = None
    transaction_type: str
    amount: float
    payment_source: Optional[str] = None
    cost_code_id: Optional[str] = None
    description: Optional[str] = None
    is_allowance: bool = False
    is_change_order: bool = False
    quickbooks_synced: bool = False
    notes: Optional[str] = None
    created_at: str
    projects: Optional[ProjectBrief] = None
    cost_codes: Optional[CostCodeBrief] = None


class CostCodeOut(BaseModel):
    id: str
    code: str
    name: str
    is_active: bool
