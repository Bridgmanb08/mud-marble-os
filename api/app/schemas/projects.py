from typing import Optional

from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    address: Optional[str] = None
    zip: Optional[str] = None
    status: str = "lead"
    project_type: Optional[str] = None
    start_date: Optional[str] = None
    estimated_completion: Optional[str] = None
    internal_notes: Optional[str] = None
    city: Optional[str] = "Indianapolis"
    state: Optional[str] = "IN"
    client_id: Optional[str] = None
    contract_value: Optional[float] = None
    color: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    zip: Optional[str] = None
    status: Optional[str] = None
    project_type: Optional[str] = None
    start_date: Optional[str] = None
    estimated_completion: Optional[str] = None
    internal_notes: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    client_id: Optional[str] = None
    contract_value: Optional[float] = None
    health_status: Optional[str] = None
    is_archived: Optional[bool] = None
    color: Optional[str] = None


class ClientBrief(BaseModel):
    id: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None


class ProjectOut(BaseModel):
    id: str
    name: str
    address: Optional[str] = None
    zip: Optional[str] = None
    status: str
    project_type: Optional[str] = None
    start_date: Optional[str] = None
    estimated_completion: Optional[str] = None
    internal_notes: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    client_id: Optional[str] = None
    contract_value: Optional[float] = None
    health_status: Optional[str] = None
    is_archived: bool = False
    color: Optional[str] = None
    created_at: str
    clients: Optional[ClientBrief] = None


class ProjectNoteCreate(BaseModel):
    author: str
    note_type: str = "internal"
    content: str
    is_client_visible: bool = False


class ProjectNoteOut(ProjectNoteCreate):
    id: str
    project_id: str
    created_at: str
