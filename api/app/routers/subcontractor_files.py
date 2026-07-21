import uuid

from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user
from ..schemas.subcontractor_files import (
    SubFileCreate,
    SubFileDownloadUrlResponse,
    SubFileOut,
    SubFileUploadUrlRequest,
    SubFileUploadUrlResponse,
)
from ..storage_client import create_signed_download_url, create_signed_upload_url, remove_objects
from ..supabase_client import db_delete, db_get, db_post

router = APIRouter(tags=["subcontractor-files"])

BUCKET = "subcontractor-files"


def _safe_filename(name: str) -> str:
    keep = "".join(c if c.isalnum() or c in "._-" else "_" for c in name)
    return keep or "file"


@router.post("/subcontractors/{sub_id}/files/upload-url", response_model=SubFileUploadUrlResponse)
async def get_upload_url(
    sub_id: str,
    body: SubFileUploadUrlRequest,
    _: CurrentUser = Depends(get_current_user),
):
    storage_path = f"{sub_id}/{uuid.uuid4()}_{_safe_filename(body.file_name)}"
    upload_url = await create_signed_upload_url(BUCKET, storage_path)
    return SubFileUploadUrlResponse(upload_url=upload_url, storage_path=storage_path)


@router.post("/subcontractors/{sub_id}/files", response_model=SubFileOut)
async def create_file(
    sub_id: str,
    body: SubFileCreate,
    current_user: CurrentUser = Depends(get_current_user),
):
    rows = await db_post(
        "subcontractor_files",
        {
            "subcontractor_id": sub_id,
            "uploaded_by": current_user.id,
            "file_name": body.file_name,
            "file_type": body.file_type,
            "mime_type": body.mime_type,
            "size_bytes": body.size_bytes,
            "storage_path": body.storage_path,
        },
    )
    return rows[0]


@router.get("/subcontractors/{sub_id}/files", response_model=list[SubFileOut])
async def list_files(sub_id: str, _: CurrentUser = Depends(get_current_user)):
    return await db_get("subcontractor_files", f"?subcontractor_id=eq.{sub_id}&order=created_at.desc")


@router.get("/subcontractor-files/{file_id}/download", response_model=SubFileDownloadUrlResponse)
async def get_download_url(file_id: str, _: CurrentUser = Depends(get_current_user)):
    rows = await db_get("subcontractor_files", f"?id=eq.{file_id}")
    if not rows:
        raise HTTPException(status_code=404, detail="File not found")
    download_url = await create_signed_download_url(BUCKET, rows[0]["storage_path"])
    return SubFileDownloadUrlResponse(download_url=download_url)


@router.delete("/subcontractor-files/{file_id}")
async def delete_file(file_id: str, _: CurrentUser = Depends(get_current_user)):
    rows = await db_get("subcontractor_files", f"?id=eq.{file_id}")
    if not rows:
        raise HTTPException(status_code=404, detail="File not found")
    await remove_objects(BUCKET, [rows[0]["storage_path"]])
    await db_delete("subcontractor_files", file_id)
    return {"ok": True}
