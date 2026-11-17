import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user
from ..media_links import clean_link, webloc_url
from ..schemas.files import DownloadUrlResponse, UploadUrlRequest, UploadUrlResponse
from ..schemas.rentals import RentalFileCreate, RentalFileOut, RentalFileUpdate, RentalLinkCreate
from ..storage_client import create_signed_download_url, create_signed_upload_url, download_object, remove_objects
from ..supabase_client import db_delete, db_get, db_patch, db_post

router = APIRouter(prefix="/rental-files", tags=["rentals"])

BUCKET = "rental-files"


def _safe_filename(name: str) -> str:
    keep = "".join(c if c.isalnum() or c in "._-" else "_" for c in name)
    return keep or "file"


async def _property_for_visit(visit_id: Optional[str]) -> Optional[dict]:
    if not visit_id:
        return None
    rows = await db_get("rental_property_visits", f"?id=eq.{visit_id}&select=id,property_id,visited_by")
    return rows[0] if rows else None


async def _remember_visitor(visit: Optional[dict], current_user: CurrentUser) -> None:
    """A file added to a visit that never recorded who was there takes the
    uploader's name. Visits that already say who went are left alone."""
    if not visit or visit.get("visited_by"):
        return
    name = (current_user.name or "").strip() or current_user.email
    if name:
        await db_patch("rental_property_visits", visit["id"], {"visited_by": name})


async def _fill_webloc_links(rows: list[dict]) -> list[dict]:
    """Read the URL out of an already-stored .webloc and keep it on the row.

    Persisting link_url needs the migration. If that column isn't there yet
    the parsed URL is still returned so the screen can show a real link.
    """
    for row in rows:
        if row.get("link_url"):
            continue
        name = row.get("file_name") or ""
        path = row.get("storage_path")
        if not path or not name.lower().endswith(".webloc"):
            continue
        try:
            content = await download_object(BUCKET, path)
        except HTTPException:
            continue
        url = webloc_url(content)
        if not url:
            continue
        row["link_url"] = url
        row["file_type"] = "link"
        try:
            await db_patch("rental_files", row["id"], {"link_url": url, "file_type": "link"})
        except HTTPException:
            pass
    return rows


@router.post("/upload-url", response_model=UploadUrlResponse)
async def get_upload_url(body: UploadUrlRequest, _: CurrentUser = Depends(get_current_user)):
    storage_path = f"{uuid.uuid4()}_{_safe_filename(body.file_name)}"
    upload_url = await create_signed_upload_url(BUCKET, storage_path)
    return UploadUrlResponse(upload_url=upload_url, storage_path=storage_path)


@router.post("", response_model=RentalFileOut)
async def create_file(body: RentalFileCreate, current_user: CurrentUser = Depends(get_current_user)):
    if not body.property_id and not body.lease_id and not body.visit_id:
        raise HTTPException(status_code=400, detail="A rental file must be attached to a property, a lease, or a visit")
    visit = await _property_for_visit(body.visit_id)
    property_id = body.property_id or (visit or {}).get("property_id")
    await _remember_visitor(visit, current_user)
    payload = {
        "property_id": property_id,
        "lease_id": body.lease_id,
        "visit_id": body.visit_id,
        "uploaded_by": current_user.id,
        "file_name": body.file_name,
        "file_type": body.file_type,
        "mime_type": body.mime_type,
        "size_bytes": body.size_bytes,
        "storage_path": body.storage_path,
    }
    link_url = None
    if body.file_name.lower().endswith(".webloc") and body.storage_path:
        try:
            link_url = webloc_url(await download_object(BUCKET, body.storage_path))
        except HTTPException:
            link_url = None
        if link_url:
            payload["link_url"] = link_url
            payload["file_type"] = "link"
    try:
        rows = await db_post("rental_files", payload)
    except HTTPException:
        if "link_url" not in payload:
            raise
        # Column isn't there until the migration runs. Keep the file, and
        # still hand the URL back so this response can show the link.
        payload.pop("link_url", None)
        payload["file_type"] = body.file_type
        rows = await db_post("rental_files", payload)
    row = rows[0]
    if link_url:
        row["link_url"] = link_url
        row["file_type"] = "link"
    return row


@router.post("/link", response_model=RentalFileOut)
async def create_link(body: RentalLinkCreate, current_user: CurrentUser = Depends(get_current_user)):
    """A pasted or dropped URL, stored as text. A macOS .webloc is parsed
    by the caller (or by create_file) and sent here instead of uploaded."""
    if not body.property_id and not body.lease_id and not body.visit_id:
        raise HTTPException(status_code=400, detail="A link must be attached to a property, a lease, or a visit")
    try:
        url = clean_link(body.link_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    visit = await _property_for_visit(body.visit_id)
    property_id = body.property_id or (visit or {}).get("property_id")
    await _remember_visitor(visit, current_user)
    try:
        rows = await db_post(
            "rental_files",
            {
                "property_id": property_id,
                "lease_id": body.lease_id,
                "visit_id": body.visit_id,
                "uploaded_by": current_user.id,
                "file_name": url,
                "file_type": "link",
                "link_url": url,
            },
        )
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else ""
        if "link_url" in detail or "storage_path" in detail:
            raise HTTPException(
                status_code=400,
                detail="That link couldn't be saved yet. Run the rental media migration, then paste it again.",
            ) from exc
        raise
    return rows[0]


@router.patch("/{file_id}", response_model=RentalFileOut)
async def update_file(file_id: str, body: RentalFileUpdate, _: CurrentUser = Depends(get_current_user)):
    """Attaches an already-uploaded file to a lease. A lease document dropped
    into the New lease form uploads immediately (before the lease exists, so
    against the property); saving the lease then moves it onto the lease."""
    if not body.lease_id:
        raise HTTPException(status_code=400, detail="lease_id is required")
    rows = await db_patch("rental_files", file_id, {"lease_id": body.lease_id})
    if not rows:
        raise HTTPException(status_code=404, detail="File not found")
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
    return await _fill_webloc_links(await db_get("rental_files", query))


@router.get("/{file_id}/download", response_model=DownloadUrlResponse)
async def get_download_url(file_id: str, _: CurrentUser = Depends(get_current_user)):
    """Signed URL for a file in the private rental-files bucket, or the
    plain URL when the row is a pasted link / a .webloc we could read."""
    rows = await _fill_webloc_links(await db_get("rental_files", f"?id=eq.{file_id}"))
    if not rows:
        raise HTTPException(status_code=404, detail="File not found")
    row = rows[0]
    if row.get("link_url"):
        return DownloadUrlResponse(download_url=row["link_url"])
    if not row.get("storage_path"):
        raise HTTPException(status_code=404, detail="File not found")
    download_url = await create_signed_download_url(BUCKET, row["storage_path"])
    return DownloadUrlResponse(download_url=download_url)


@router.delete("/{file_id}")
async def delete_file(file_id: str, _: CurrentUser = Depends(get_current_user)):
    rows = await db_get("rental_files", f"?id=eq.{file_id}")
    if not rows:
        raise HTTPException(status_code=404, detail="File not found")
    if rows[0].get("storage_path"):
        await remove_objects(BUCKET, [rows[0]["storage_path"]])
    await db_delete("rental_files", file_id)
    return {"ok": True}
