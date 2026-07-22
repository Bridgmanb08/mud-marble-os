from typing import Optional

from pydantic import BaseModel


class InboundMediaOut(BaseModel):
    id: str
    from_phone: str
    body: Optional[str] = None
    storage_path: str
    mime_type: Optional[str] = None
    file_type: str
    status: str
    project_id: Optional[str] = None
    created_at: str


class AssignProjectRequest(BaseModel):
    project_id: str
