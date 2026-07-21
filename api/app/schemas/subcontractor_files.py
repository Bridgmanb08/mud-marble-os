from typing import Optional

from pydantic import BaseModel


class SubFileUploadUrlRequest(BaseModel):
    file_name: str
    file_type: str = "other"
    mime_type: Optional[str] = None


class SubFileUploadUrlResponse(BaseModel):
    upload_url: str
    storage_path: str


class SubFileCreate(BaseModel):
    file_name: str
    file_type: str = "other"
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    storage_path: str


class SubFileOut(BaseModel):
    id: str
    subcontractor_id: str
    uploaded_by: Optional[str] = None
    file_name: str
    file_type: str
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    storage_path: str
    created_at: str


class SubFileDownloadUrlResponse(BaseModel):
    download_url: str
