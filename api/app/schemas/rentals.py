from typing import Literal, Optional

from pydantic import BaseModel


class RentalPropertyCreate(BaseModel):
    address: str
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    property_type: str = "single_family"
    notes: Optional[str] = None


class RentalPropertyUpdate(BaseModel):
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    property_type: Optional[str] = None
    notes: Optional[str] = None
    is_archived: Optional[bool] = None


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


RentalPropertyOut.model_rebuild()
