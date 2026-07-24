from typing import Optional

from pydantic import BaseModel


class MessageThreadOut(BaseModel):
    phone_number: str
    contact_name: Optional[str] = None
    contact_trade: Optional[str] = None
    last_body: Optional[str] = None
    last_direction: str
    last_created_at: str
    message_count: int
    pending_media_count: int = 0


class MessageOut(BaseModel):
    id: str
    phone_number: str
    direction: str
    body: Optional[str] = None
    message_sid: Optional[str] = None
    project_id: Optional[str] = None
    project_name: Optional[str] = None
    sent_by: Optional[str] = None
    sent_by_name: Optional[str] = None
    storage_path: Optional[str] = None
    mime_type: Optional[str] = None
    file_type: Optional[str] = None
    error: Optional[str] = None
    created_at: str


class SendMessageRequest(BaseModel):
    body: str
    project_id: Optional[str] = None
