from typing import Literal, Optional

from pydantic import BaseModel


class RentalPropertyCreate(BaseModel):
    address: str
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    property_type: str = "single_family"
    notes: Optional[str] = None
    ownership_name: Optional[str] = None
    ownership_pct: Optional[float] = None
    purchase_value: Optional[float] = None
    debt: Optional[float] = None
    target_monthly_rent: Optional[float] = None
    interest_rate: Optional[float] = None
    mortgage_payment: Optional[float] = None
    loan_number: Optional[str] = None
    lender: Optional[str] = None
    taxes_monthly: Optional[float] = None
    insurance_annual: Optional[float] = None
    insurance_monthly: Optional[float] = None
    other_expenses_monthly: Optional[float] = None
    maintenance_monthly: Optional[float] = None
    mowing_monthly: Optional[float] = None
    utilities_monthly: Optional[float] = None
    year_acquired: Optional[int] = None
    parcel_number: Optional[str] = None


class RentalPropertyUpdate(BaseModel):
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    property_type: Optional[str] = None
    notes: Optional[str] = None
    is_archived: Optional[bool] = None
    ownership_name: Optional[str] = None
    ownership_pct: Optional[float] = None
    purchase_value: Optional[float] = None
    debt: Optional[float] = None
    target_monthly_rent: Optional[float] = None
    interest_rate: Optional[float] = None
    mortgage_payment: Optional[float] = None
    loan_number: Optional[str] = None
    lender: Optional[str] = None
    taxes_monthly: Optional[float] = None
    insurance_annual: Optional[float] = None
    insurance_monthly: Optional[float] = None
    other_expenses_monthly: Optional[float] = None
    maintenance_monthly: Optional[float] = None
    mowing_monthly: Optional[float] = None
    utilities_monthly: Optional[float] = None
    year_acquired: Optional[int] = None
    parcel_number: Optional[str] = None


class RentalPropertyOut(BaseModel):
    id: str
    address: str
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    property_type: str
    notes: Optional[str] = None
    is_archived: bool
    created_at: str
    ownership_name: Optional[str] = None
    ownership_pct: Optional[float] = None
    purchase_value: Optional[float] = None
    debt: Optional[float] = None
    target_monthly_rent: Optional[float] = None
    interest_rate: Optional[float] = None
    mortgage_payment: Optional[float] = None
    loan_number: Optional[str] = None
    lender: Optional[str] = None
    taxes_monthly: Optional[float] = None
    insurance_annual: Optional[float] = None
    insurance_monthly: Optional[float] = None
    other_expenses_monthly: Optional[float] = None
    maintenance_monthly: Optional[float] = None
    mowing_monthly: Optional[float] = None
    utilities_monthly: Optional[float] = None
    year_acquired: Optional[int] = None
    parcel_number: Optional[str] = None
    # Computed, not stored -- purchase_value minus debt, and a rough monthly
    # cash-flow estimate (target rent minus every known carrying cost, nulls
    # treated as 0). Matches this app's convention of deriving state from
    # underlying numbers rather than storing a value that can drift out of
    # sync (see lease_status/is_late below).
    equity: Optional[float] = None
    estimated_monthly_cash_flow: Optional[float] = None
    # Computed from the most recent row in rental_property_visits -- same
    # derive-don't-store convention as equity/cash-flow above.
    last_visited_at: Optional[str] = None
    days_since_visit: Optional[int] = None
    units: list["RentalUnitOut"] = []


class RentalUnitCreate(BaseModel):
    unit_label: str = "Main"
    bedrooms: Optional[float] = None
    bathrooms: Optional[float] = None
    square_feet: Optional[float] = None


class RentalUnitUpdate(BaseModel):
    unit_label: Optional[str] = None
    bedrooms: Optional[float] = None
    bathrooms: Optional[float] = None
    square_feet: Optional[float] = None


class RentalUnitOut(BaseModel):
    id: str
    property_id: str
    unit_label: str
    bedrooms: Optional[float] = None
    bathrooms: Optional[float] = None
    square_feet: Optional[float] = None
    created_at: str
    # Populated by the property-detail enrichment step, not a DB column --
    # lets the frontend show "occupied"/"vacant" without a second round trip.
    current_lease_id: Optional[str] = None
    current_tenant_name: Optional[str] = None


class RentalTenantCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    notes: Optional[str] = None


class RentalTenantUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    notes: Optional[str] = None


class RentalTenantOut(BaseModel):
    id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    notes: Optional[str] = None
    created_at: str


class RentalLeaseCreate(BaseModel):
    unit_id: str
    tenant_id: str
    start_date: str
    end_date: str
    monthly_rent: float = 0
    security_deposit: Optional[float] = None
    rent_due_day: int = 1
    notes: Optional[str] = None


class RentalLeaseUpdate(BaseModel):
    tenant_id: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    monthly_rent: Optional[float] = None
    security_deposit: Optional[float] = None
    rent_due_day: Optional[int] = None
    notes: Optional[str] = None
    renewal_status: Optional[str] = None
    renewal_rent_increase: Optional[float] = None


class RentalLeaseOut(BaseModel):
    id: str
    unit_id: str
    tenant_id: str
    start_date: str
    end_date: str
    monthly_rent: float
    security_deposit: Optional[float] = None
    rent_due_day: int
    notes: Optional[str] = None
    created_at: str
    # "undecided" / "renewing" / "not_renewing" -- a real 3-state improvement
    # over the plain checkbox this mirrors from Brent's spreadsheet, so
    # "haven't discussed it yet" isn't indistinguishable from "declining".
    renewal_status: Literal["undecided", "renewing", "not_renewing"] = "undecided"
    renewal_rent_increase: Optional[float] = None
    # Computed, not stored -- derived from start_date/end_date vs. today,
    # matching this app's convention for other date-derived state (task
    # overdue, CO sop_breach) rather than a manually-set flag that goes stale.
    lease_status: Literal["upcoming", "active", "ended"] = "active"
    tenants: Optional[RentalTenantOut] = None
    rental_units: Optional[RentalUnitOut] = None


class RentalPaymentUpdate(BaseModel):
    amount_paid: Optional[float] = None
    paid_date: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class RentalPaymentOut(BaseModel):
    id: str
    lease_id: str
    due_date: str
    amount_due: float
    amount_paid: Optional[float] = None
    paid_date: Optional[str] = None
    status: str
    notes: Optional[str] = None
    # Computed, not stored -- due_date in the past with no full payment on
    # record. See lease_status above for the same convention.
    is_late: bool = False


class RentalWorkOrderCreate(BaseModel):
    property_id: str
    unit_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    priority: str = "normal"
    assigned_to: Optional[str] = None


class RentalWorkOrderUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[str] = None
    unit_id: Optional[str] = None


class RentalWorkOrderOut(BaseModel):
    id: str
    property_id: str
    unit_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    status: str
    priority: str
    assigned_to: Optional[str] = None
    task_id: Optional[str] = None
    created_at: str
    resolved_at: Optional[str] = None
    # Lightweight embed for display (mirrors the ProjectBrief{name} convention
    # used on ChangeOrderOut/InvoiceOut) -- not the full nested property.
    property_address: Optional[str] = None
    unit_label: Optional[str] = None


class RentalFileCreate(BaseModel):
    property_id: Optional[str] = None
    lease_id: Optional[str] = None
    visit_id: Optional[str] = None
    file_name: str
    file_type: str = "lease"
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    storage_path: str


class RentalFileOut(BaseModel):
    id: str
    property_id: Optional[str] = None
    lease_id: Optional[str] = None
    visit_id: Optional[str] = None
    uploaded_by: Optional[str] = None
    file_name: str
    file_type: str
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    storage_path: str
    created_at: str


class RentalPropertyVisitCreate(BaseModel):
    visited_at: Optional[str] = None  # defaults to today server-side if omitted
    visited_by: Optional[str] = None
    notes: Optional[str] = None


class RentalPropertyVisitUpdate(BaseModel):
    visited_at: Optional[str] = None
    visited_by: Optional[str] = None
    notes: Optional[str] = None


class RentalPropertyVisitOut(BaseModel):
    id: str
    property_id: str
    visited_at: str
    visited_by: Optional[str] = None
    notes: Optional[str] = None
    created_at: str


class RentRollRow(BaseModel):
    """One row per unit -- the master rent-roll view every competitor
    platform (Buildium/AppFolio/DoorLoop/etc.) treats as its flagship
    screen. Combines occupancy, this-period rent collection, arrears,
    property-visit staleness, and lease-renewal status in one place so the
    property list can show real operational signal instead of just static
    address/unit-count data."""

    property_id: str
    property_address: str
    unit_id: str
    unit_label: str
    lease_id: Optional[str] = None
    tenant_name: Optional[str] = None
    monthly_rent: Optional[float] = None
    rent_due_day: Optional[int] = None
    lease_status: Optional[Literal["upcoming", "active", "ended"]] = None
    # Rolling arrears snapshot, computed from rental_payments -- current
    # month's due/paid amounts plus everything still owed from prior months.
    current_month_due: float = 0
    current_month_paid: float = 0
    past_due_total: float = 0
    is_late: bool = False
    last_visited_at: Optional[str] = None
    days_since_visit: Optional[int] = None
    lease_end_date: Optional[str] = None
    renewal_status: Optional[Literal["undecided", "renewing", "not_renewing"]] = None
    renewal_rent_increase: Optional[float] = None


class RentalDashboardSummary(BaseModel):
    # Percentage of rent due in the trailing N days paid on or before its due
    # date -- null (not 0) when there's no due-and-payable rent yet in that
    # window, so the widget can distinguish "nothing to show" from "0% on time".
    on_time_rate_30: Optional[float] = None
    on_time_rate_60: Optional[float] = None
    on_time_rate_90: Optional[float] = None
    leases_expiring_60d: int = 0
    open_work_orders: int = 0


RentalPropertyOut.model_rebuild()
