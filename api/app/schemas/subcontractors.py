from typing import Optional

from pydantic import BaseModel


class SubcontractorCreate(BaseModel):
    company_name: str
    trade: Optional[str] = None
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    insurance_expiry: Optional[str] = None
    license_number: Optional[str] = None
    rating: Optional[int] = None
    preferred: bool = False
    w9_on_file: bool = False
    notes: Optional[str] = None
    is_active: bool = True


class SubcontractorUpdate(BaseModel):
    company_name: Optional[str] = None
    trade: Optional[str] = None
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    insurance_expiry: Optional[str] = None
    license_number: Optional[str] = None
    rating: Optional[int] = None
    preferred: Optional[bool] = None
    w9_on_file: Optional[bool] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class SubcontractorOut(BaseModel):
    id: str
    company_name: str
    trade: Optional[str] = None
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    insurance_expiry: Optional[str] = None
    license_number: Optional[str] = None
    rating: Optional[int] = None
    preferred: bool = False
    w9_on_file: bool = False
    notes: Optional[str] = None
    is_active: bool = True
    created_at: str
