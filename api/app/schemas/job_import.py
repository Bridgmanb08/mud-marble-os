from typing import Optional

from pydantic import BaseModel


class JobImportStatus(BaseModel):
    project_id: str
    project_name: str
    has_estimate: bool
    has_financials: bool
    has_inhouse: bool


class EstimateSheetRow(BaseModel):
    title: str
    category: Optional[str] = None
    cost_code: Optional[str] = None
    quantity: float
    unit_cost: float
    markup_type: str
    markup_value: float
    description: Optional[str] = None
    internal_notes: Optional[str] = None
    bucket: str
    matched_cost_code_id: Optional[str] = None
    already_present: bool = False


class EstimateSheetPreview(BaseModel):
    rows: list[EstimateSheetRow]
    existing_estimate_id: Optional[str] = None


class TransactionSheetRow(BaseModel):
    date: str
    vendor: Optional[str] = None
    transaction_type: str
    amount: float
    payment_source: Optional[str] = None
    cost_code: Optional[str] = None
    matched_cost_code_id: Optional[str] = None
    description: Optional[str] = None
    already_present: bool = False


class ContractItem(BaseModel):
    description: Optional[str] = None
    amount: float


class ContractPayment(BaseModel):
    date: str
    amount: float
    category: Optional[str] = None


class ContractorBlock(BaseModel):
    subcontractor_name: str
    matched_subcontractor_id: Optional[str] = None
    contract_items: list[ContractItem]
    payments: list[ContractPayment]


class InHouseSheetPreview(BaseModel):
    transactions: list[TransactionSheetRow]
    contractors: list[ContractorBlock]
