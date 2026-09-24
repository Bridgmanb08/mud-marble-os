from typing import Optional

from pydantic import BaseModel


class ChangeOrderCreate(BaseModel):
    project_id: str
    title: str
    co_type: str = "client_addition"
    # Always 0 on create -- the frontend's New Change Order form no longer
    # has price fields at all; every change order starts empty and its
    # price only ever comes from line items added afterward, same as a new
    # estimate or invoice. Kept here (rather than dropped entirely) only so
    # the column always gets an explicit value on insert.
    owner_price: float = 0
    builder_cost: float = 0
    description: Optional[str] = None
    notes_internal: Optional[str] = None
    discovered_by: Optional[str] = None


class ChangeOrderUpdate(BaseModel):
    # No owner_price/builder_cost here on purpose -- once a change order
    # exists, its price can only ever come from summing its line items
    # (_recalc_co_totals in change_orders.py, called after every line-item
    # add/edit/delete), never typed directly onto the change order the way
    # estimates and invoices don't let you free-type their totals either.
    status: Optional[str] = None
    sent_at: Optional[str] = None
    title: Optional[str] = None
    co_type: Optional[str] = None
    description: Optional[str] = None
    notes_internal: Optional[str] = None
    discovered_by: Optional[str] = None


class ProjectBrief(BaseModel):
    name: str
    address: Optional[str] = None


class ChangeOrderOut(BaseModel):
    id: str
    project_id: str
    co_number: Optional[int] = None
    title: str
    co_type: str
    owner_price: float
    builder_cost: Optional[float] = None
    description: Optional[str] = None
    notes_internal: Optional[str] = None
    discovered_by: Optional[str] = None
    status: str
    sent_at: Optional[str] = None
    created_at: str
    projects: Optional[ProjectBrief] = None
    sop_breach: bool = False
