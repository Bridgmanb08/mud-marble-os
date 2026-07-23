from typing import Optional

from pydantic import BaseModel


class ClientBrief(BaseModel):
    id: str
    first_name: str
    last_name: Optional[str] = None


class ClientCreate(BaseModel):
    first_name: str
    last_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    referral_name: Optional[str] = None
    referred_by_client_id: Optional[str] = None
    funding_type: Optional[str] = None
    preferred_contact_method: Optional[str] = None
    spouse_partner_name: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True


class ClientUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    referral_name: Optional[str] = None
    referred_by_client_id: Optional[str] = None
    is_advocate: Optional[bool] = None
    is_repeat_client: Optional[bool] = None
    referral_gift_sent: Optional[bool] = None
    referral_gift_description: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class ClientOut(ClientCreate):
    id: str
    is_advocate: bool = False
    is_repeat_client: bool = False
    referral_gift_sent: bool = False
    referral_gift_description: Optional[str] = None
    lifetime_value: Optional[float] = None
    created_at: Optional[str] = None
    referred_by: Optional[ClientBrief] = None
    referred: list[ClientBrief] = []
