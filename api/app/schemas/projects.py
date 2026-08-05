from typing import Optional

from pydantic import BaseModel, model_validator

from ..date_validation import check_date_order
from .sms_contacts import SmsContactBrief


class ProjectCreate(BaseModel):
    name: str
    address: Optional[str] = None
    zip: Optional[str] = None
    status: str = "lead"
    project_type: Optional[str] = None
    start_date: Optional[str] = None
    estimated_completion: Optional[str] = None
    internal_notes: Optional[str] = None
    city: Optional[str] = "Indianapolis"
    state: Optional[str] = "IN"
    client_id: Optional[str] = None
    contract_value: Optional[float] = None
    color: Optional[str] = None

    @model_validator(mode="after")
    def _validate_dates(self):
        check_date_order(self.start_date, self.estimated_completion, "Estimated completion date")
        return self


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    zip: Optional[str] = None
    status: Optional[str] = None
    project_type: Optional[str] = None
    start_date: Optional[str] = None
    estimated_completion: Optional[str] = None
    internal_notes: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    client_id: Optional[str] = None
    contract_value: Optional[float] = None
    health_status: Optional[str] = None
    is_archived: Optional[bool] = None
    color: Optional[str] = None
    checking_balance: Optional[float] = None
    credit_card_balance: Optional[float] = None
    pending_invoices_manual: Optional[float] = None

    @model_validator(mode="after")
    def _validate_dates(self):
        check_date_order(self.start_date, self.estimated_completion, "Estimated completion date")
        return self


class ClientBrief(BaseModel):
    id: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    preferred_contact_method: Optional[str] = None
    is_advocate: bool = False
    is_repeat_client: bool = False
    notes: Optional[str] = None


class ProjectOut(BaseModel):
    id: str
    name: str
    address: Optional[str] = None
    zip: Optional[str] = None
    status: str
    project_type: Optional[str] = None
    start_date: Optional[str] = None
    estimated_completion: Optional[str] = None
    internal_notes: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    client_id: Optional[str] = None
    contract_value: Optional[float] = None
    health_status: Optional[str] = None
    is_archived: bool = False
    color: Optional[str] = None
    checking_balance: Optional[float] = None
    credit_card_balance: Optional[float] = None
    pending_invoices_manual: Optional[float] = None
    created_at: str
    clients: Optional[ClientBrief] = None
    sms_contacts: list[SmsContactBrief] = []


class FinancialSummaryOut(BaseModel):
    owner_price: float = 0
    builder_cost: float = 0
    profit: float = 0
    change_order_owner_price: float = 0
    change_order_builder_cost: float = 0
    contracted_to_subs: float = 0
    paid_to_subs: float = 0
    left_to_pay: float = 0
    invoiced_to_date: float = 0
    remaining_to_invoice: float = 0
    checking_balance: Optional[float] = None
    credit_card_balance: Optional[float] = None
    pending_invoices_manual: Optional[float] = None


class ProjectNoteCreate(BaseModel):
    author: str
    note_type: str = "internal"
    content: str
    is_client_visible: bool = False


class ProjectNoteOut(ProjectNoteCreate):
    id: str
    project_id: str
    created_at: str
