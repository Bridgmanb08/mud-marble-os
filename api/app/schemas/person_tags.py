from typing import Optional

from pydantic import BaseModel


class PersonTagCreate(BaseModel):
    label: str
    color: str = "#7B4B34"


class PersonTagUpdate(BaseModel):
    label: Optional[str] = None
    color: Optional[str] = None


class PersonTagOut(BaseModel):
    id: str
    label: str
    color: str
    created_at: str


class PersonTagLinkCreate(BaseModel):
    entity_type: str
    entity_id: str


class PersonTagLinkOut(BaseModel):
    id: str
    tag_id: str
    entity_type: str
    entity_id: str
    created_at: str
