from typing import Optional

from pydantic import BaseModel


class JobImportStatus(BaseModel):
    project_id: str
    project_name: str
    has_estimate: bool
    has_financials: bool
    has_inhouse: bool


class FieldDiff(BaseModel):
    field: str
    existing: Optional[str] = None
    incoming: Optional[str] = None


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
    existing_id: Optional[str] = None
    conflict: bool = False
    diff: list[FieldDiff] = []


class EstimateSheetPreview(BaseModel):
    rows: list[EstimateSheetRow]
    existing_estimate_id: Optional[str] = None
    dropped_count: int = 0


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
    existing_id: Optional[str] = None
    conflict: bool = False
    diff: list[FieldDiff] = []


class ContractItem(BaseModel):
    description: Optional[str] = None
    amount: float
    already_present: bool = False
    existing_id: Optional[str] = None
    conflict: bool = False
    diff: list[FieldDiff] = []


class ContractPayment(BaseModel):
    date: str
    amount: float
    category: Optional[str] = None
    already_present: bool = False


class ContractorBlock(BaseModel):
    subcontractor_name: str
    matched_subcontractor_id: Optional[str] = None
    contract_items: list[ContractItem]
    payments: list[ContractPayment]


class InHouseSheetPreview(BaseModel):
    transactions: list[TransactionSheetRow]
    contractors: list[ContractorBlock]
    dropped_count: int = 0


class InvoiceScanRow(BaseModel):
    invoice_number: Optional[str] = None
    invoice_type: str = "progress"
    amount_due: float = 0
    due_date: Optional[str] = None
    notes_external: Optional[str] = None
    confidence: str = "high"
    uncertain_fields: list[str] = []
    already_present: bool = False
    existing_id: Optional[str] = None
    conflict: bool = False
    diff: list[FieldDiff] = []


class InvoiceScanPreview(BaseModel):
    row: InvoiceScanRow


class ChangeOrderScanRow(BaseModel):
    title: str
    co_type: str = "client_addition"
    owner_price: float = 0
    builder_cost: float = 0
    description: Optional[str] = None
    discovered_by: Optional[str] = None
    confidence: str = "high"
    uncertain_fields: list[str] = []
    already_present: bool = False
    existing_id: Optional[str] = None
    conflict: bool = False
    diff: list[FieldDiff] = []


class ChangeOrderScanPreview(BaseModel):
    row: ChangeOrderScanRow
