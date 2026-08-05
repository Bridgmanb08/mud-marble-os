import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user
from ..schemas.files import DownloadUrlResponse, UploadUrlRequest, UploadUrlResponse
from ..schemas.rentals import RentalFileCreate, RentalFileOut
from ..storage_client import create_signed_download_url, create_signed_upload_url, remove_objects
from ..supabase_client import db_delete, db_get, db_post

router = APIRouter(prefix="/rental-files", tags=["rentals"])

BUCKET = "rental-files"


def _safe_filename(name: str) -> str:
    keep = "".join(c if c.isalnum() or c in "._-" else "_" for c in name)
    return keep or "file"


@router.post("/upload-url", response_model=UploadUrlResponse)
async def get_upload_url(body: UploadUrlRequest, _: CurrentUser = Depends(get_current_user)):
    storage_path = f"{uuid.uuid4()}_{_safe_filename(body.file_name)}"
    upload_url = await create_signed_upload_url(BUCKET, storage_path)
    return UploadUrlResponse(upload_url=upload_url, storage_path=storage_path)


@router.post("", response_model=RentalFileOut)
async def create_file(body: RentalFileCreate, current_user: CurrentUser = Depends(get_current_user)):
    if not body.property_id and not body.lease_id and not body.visit_id:
        raise HTTPException(status_code=400, detail="A rental file must be attached to a property, a lease, or a visit")
    rows = await db_post(
        "rental_files",
        {
            "property_id": body.property_id,
            "lease_id": body.lease_id,
            "visit_id": body.visit_id,
            "uploaded_by": current_user.id,
            "file_name": body.file_name,
            "file_type": body.file_type,
            "mime_type": body.mime_type,
            "size_bytes": body.size_bytes,
            "storage_path": body.storage_path,
        },
    )
    return rows[0]


@router.get("", response_model=list[RentalFileOut])
async def list_files(
    property_id: Optional[str] = None,
    lease_id: Optional[str] = None,
    visit_id: Optional[str] = None,
    _: CurrentUser = Depends(get_current_user),
):
    if visit_id:
        query = f"?visit_id=eq.{visit_id}&order=created_at.desc"
    elif lease_id:
        query = f"?lease_id=eq.{lease_id}&order=created_at.desc"
    elif property_id:
        query = f"?property_id=eq.{property_id}&order=created_at.desc"
    else:
        raise HTTPException(status_code=400, detail="Provide property_id, lease_id, or visit_id")
    return await db_get("rental_files", query)


@router.get("/{file_id}/download", response_model=DownloadUrlResponse)
async def get_download_url(file_id: str, _: CurrentUser = Depends(get_current_user)):
    rows = await db_get("rental_files", f"?id=eq.{file_id}")
    if not rows:
        raise HTTPException(status_code=404, detail="File not found")
    download_url = await create_signed_download_url(BUCKET, rows[0]["storage_path"])
    return DownloadUrlResponse(download_url=download_url)


@router.delete("/{file_id}")
async def delete_file(file_id: str, _: CurrentUser = Depends(get_current_user)):
    rows = await db_get("rental_files", f"?id=eq.{file_id}")
    if not rows:
        raise HTTPException(status_code=404, detail="File not found")
    await remove_objects(BUCKET, [rows[0]["storage_path"]])
    await db_delete("rental_files", file_id)
    return {"ok": True}
