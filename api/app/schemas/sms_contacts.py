from typing import Optional

from pydantic import BaseModel


class SmsContactBrief(BaseModel):
    id: str
    phone_number: str
    name: Optional[str] = None


class SmsContactOut(SmsContactBrief):
    subcontractor_id: Optional[str] = None
    project_id: Optional[str] = None
    created_at: str
    updated_at: str


class SmsContactUpsert(BaseModel):
    name: Optional[str] = None
    subcontractor_id: Optional[str] = None
    project_id: Optional[str] = None
