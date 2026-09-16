from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class NetworkPersonCreate(BaseModel):
    name: str
    notes: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    title: Optional[str] = None


class NetworkPersonUpdate(BaseModel):
    name: Optional[str] = None
    notes: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    title: Optional[str] = None


class NetworkPersonOut(NetworkPersonCreate):
    id: str
    is_root: bool = False
    created_at: datetime


class NetworkConnectionCreate(BaseModel):
    from_person_id: str
    to_person_id: str


class NetworkConnectionOut(NetworkConnectionCreate):
    id: str
    created_at: datetime


class NetworkGraphOut(BaseModel):
    people: list[NetworkPersonOut]
    connections: list[NetworkConnectionOut]
