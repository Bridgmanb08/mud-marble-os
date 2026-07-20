from typing import Optional

from pydantic import BaseModel


class UploadUrlRequest(BaseModel):
    file_name: str
    file_type: str = "other"
    mime_type: Optional[str] = None


class UploadUrlResponse(BaseModel):
    upload_url: str
    storage_path: str


class FileCreate(BaseModel):
    file_name: str
    file_type: str = "other"
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    storage_path: str
    task_ids: list[str] = []


class FileOut(BaseModel):
    id: str
    project_id: str
    uploaded_by: Optional[str] = None
    file_name: str
    file_type: str
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    storage_path: str
    created_at: str
    task_ids: list[str] = []


class DownloadUrlResponse(BaseModel):
    download_url: str
