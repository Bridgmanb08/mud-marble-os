from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel

# What kind of thing a node represents -- most nodes are a named individual,
# but "organization" (a company with no one specific contact yet) and
# "title" (a role, e.g. "General Contractor") let the web hold a node that
# isn't a person at all, per Brent's request to place any of the three
# without requiring a connection to create it.
NodeType = Literal["person", "organization", "title"]


class NetworkPersonCreate(BaseModel):
    name: str
    node_type: NodeType = "person"
    notes: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    title: Optional[str] = None


class NetworkPersonUpdate(BaseModel):
    name: Optional[str] = None
    node_type: Optional[NodeType] = None
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
