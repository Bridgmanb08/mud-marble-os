from typing import Optional

from pydantic import BaseModel


class ChangeOrderCreate(BaseModel):
    project_id: str
    title: str
    co_type: str = "client_addition"
    owner_price: float = 0
    builder_cost: float = 0
    description: Optional[str] = None
    discovered_by: Optional[str] = None


class ChangeOrderUpdate(BaseModel):
    status: Optional[str] = None
    sent_at: Optional[str] = None


class ProjectBrief(BaseModel):
    name: str


class ChangeOrderOut(BaseModel):
    id: str
    project_id: str
    co_number: Optional[int] = None
    title: str
    co_type: str
    owner_price: float
    builder_cost: Optional[float] = None
    description: Optional[str] = None
    discovered_by: Optional[str] = None
    status: str
    sent_at: Optional[str] = None
    created_at: str
    projects: Optional[ProjectBrief] = None
    sop_breach: bool = False
