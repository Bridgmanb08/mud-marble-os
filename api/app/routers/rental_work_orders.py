import asyncio
import urllib.parse
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from ..config import settings
from ..deps import CurrentUser, get_current_user
from ..media_links import assert_media_size, clean_link, extract_urls, media_kind
from ..mentions import create_mention_notifications
from ..schemas.files import DownloadUrlResponse, UploadUrlResponse
from ..schemas.rentals import (
    RentalWorkOrderCommentCreate,
    RentalWorkOrderCommentOut,
    RentalWorkOrderCreate,
    RentalWorkOrderMediaCreate,
    RentalWorkOrderMediaOut,
    RentalWorkOrderOut,
    RentalWorkOrderUpdate,
    RentalWorkOrderUploadRequest,
)
from ..schemas.tasks import TaskCreate, TaskUpdate
from ..storage_client import create_signed_download_url, create_signed_upload_url
from ..supabase_client import db_delete, db_get, db_patch, db_post, db_post_many
from .rental_files import BUCKET, _safe_filename
from .tasks import create_task, update_task

router = APIRouter(prefix="/rental-work-orders", tags=["rentals"])

# Work-order status -> linked Task Board column. One-directional: changing a
# work order's status here updates its linked task, but completing the task
# directly on the Task Board does NOT sync back to the work order (a real,
# accepted MVP simplification, flagged in the plan as a follow-up).
_STATUS_TO_TASK_STATUS = {"open": "upcoming", "in_progress": "in_progress", "resolved": "complete"}


def _file_url(storage_path: str) -> str:
    """Stable private-bucket URL. Open it through the download route, which
    mints a signed URL. Storing the signed URL would expire it."""
    quoted = urllib.parse.quote(storage_path, safe="/")
    return f"{settings.supabase_url.rstrip('/')}/storage/v1/object/{BUCKET}/{quoted}"


def _links_from(body_links: list[str], *texts: Optional[str]) -> list[str]:
    cleaned: list[str] = []
    for raw in body_links:
        url = clean_link(raw)
        if url not in cleaned:
            cleaned.append(url)
    for url in extract_urls(*texts):
        if url not in cleaned:
            cleaned.append(url)
    return cleaned


def _media_table_missing(exc: HTTPException) -> bool:
    detail = exc.detail if isinstance(exc.detail, str) else ""
    return "rental_work_order_media" in detail or "rental_work_order_updates" in detail


async def _record_links(
    work_order_id: str,
    property_id: str,
    update_text: Optional[str],
    uploaded_by: str,
    links: list[str],
    update_id: Optional[str] = None,
) -> None:
    if not links:
        return
    rows = []
    for url in links:
        row = {
            "work_order_id": work_order_id,
            "property_id": property_id,
            "uploaded_by": uploaded_by,
            "kind": "link",
            "link_url": url,
            "update_text": update_text,
            "file_name": url,
        }
        if update_id:
            row["update_id"] = update_id
        rows.append(row)
    await db_post_many("rental_work_order_media", rows)


async def _enrich(rows: list[dict]) -> list[RentalWorkOrderOut]:
    if not rows:
        return []
    property_ids = list({r["property_id"] for r in rows})
    unit_ids = list({r["unit_id"] for r in rows if r.get("unit_id")})
    properties, units = await asyncio.gather(
        db_get("rental_properties", f"?id=in.({','.join(property_ids)})&select=id,address"),
        db_get("rental_units", f"?id=in.({','.join(unit_ids)})&select=id,unit_label") if unit_ids else asyncio.sleep(0, result=[]),
    )
    address_by_id = {p["id"]: p["address"] for p in properties}
    label_by_id = {u["id"]: u["unit_label"] for u in units}
    return [
        RentalWorkOrderOut(
            **r,
            property_address=address_by_id.get(r["property_id"]),
            unit_label=label_by_id.get(r["unit_id"]) if r.get("unit_id") else None,
        )
        for r in rows
    ]


async def _names_for(user_ids: list[str]) -> dict[str, str]:
    ids = [i for i in dict.fromkeys(user_ids) if i]
    if not ids:
        return {}
    users = await db_get("app_users", f"?id=in.({','.join(ids)})&select=id,name")
    return {u["id"]: u.get("name") or "" for u in users}


async def _with_download(rows: list[dict]) -> list[RentalWorkOrderMediaOut]:
    names = await _names_for([r.get("uploaded_by") for r in rows])
    out = []
    for r in rows:
        download_url = None
        if r.get("storage_path") and r.get("kind") != "link":
            try:
                download_url = await create_signed_download_url(BUCKET, r["storage_path"])
            except HTTPException:
                download_url = None
        out.append(
            RentalWorkOrderMediaOut(
                **r,
                uploader_name=names.get(r.get("uploaded_by")),
                download_url=download_url,
            )
        )
    return out


@router.get("", response_model=list[RentalWorkOrderOut])
async def list_work_orders(
    property_id: Optional[str] = None, status: Optional[str] = None, _: CurrentUser = Depends(get_current_user)
):
    query = "?order=created_at.desc"
    if property_id:
        query += f"&property_id=eq.{property_id}"
    if status:
        query += f"&status=eq.{status}"
    rows = await db_get("rental_work_orders", query)
    return await _enrich(rows)


@router.get("/media-index", response_model=list[RentalWorkOrderMediaOut])
async def list_all_media(property_id: Optional[str] = None, _: CurrentUser = Depends(get_current_user)):
    """Every photo, video, and pasted link across work orders. Same columns
    a SQL reviewer selects from rental_work_order_media, plus a signed
    download_url for files."""
    query = "?order=created_at.desc"
    if property_id:
        query += f"&property_id=eq.{property_id}"
    rows = await db_get("rental_work_order_media", query)
    return await _with_download(rows)


@router.post("", response_model=RentalWorkOrderOut)
async def create_work_order(body: RentalWorkOrderCreate, current_user: CurrentUser = Depends(get_current_user)):
    if not (body.title or "").strip():
        raise HTTPException(status_code=400, detail="A title is required.")
    if not body.property_id:
        raise HTTPException(status_code=400, detail="Choose a property.")
    try:
        links = _links_from(body.links, body.description)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    property_rows = await db_get("rental_properties", f"?id=eq.{body.property_id}&select=address")
    if not property_rows:
        raise HTTPException(status_code=404, detail="Property not found")
    address = property_rows[0]["address"]

    # Creates a linked Task Board card (project_id: null, title prefixed with
    # the property address) via the real tasks.create_task endpoint function
    # -- reuses its position-assignment/assignee-normalization logic instead
    # of duplicating it, matching this codebase's established
    # import-and-reuse convention (e.g. estimate_templates.py reusing
    # estimates.py's _compute_costs).
    #
    # Pass current_user by its real name. Calling this with `_=current_user`
    # raised TypeError before any row was written, and the button looked
    # like it did nothing.
    try:
        task = await create_task(
            TaskCreate(
                project_id=None,
                title=f"[{address}] {body.title.strip()}",
                assigned_to=body.assigned_to,
                priority=body.priority,
                notes=f"Rental work order for {address}." + (f"\n\n{body.description}" if body.description else ""),
            ),
            current_user=current_user,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Couldn't create the work order: {exc}") from exc

    rows = await db_post(
        "rental_work_orders",
        {
            "property_id": body.property_id,
            "unit_id": body.unit_id,
            "title": body.title.strip(),
            "description": body.description,
            "priority": body.priority,
            "assigned_to": body.assigned_to,
            "task_id": task.id,
        },
    )
    created = rows[0]
    try:
        await _record_links(
            created["id"],
            body.property_id,
            body.description,
            current_user.id,
            links,
        )
    except HTTPException as exc:
        await db_delete("rental_work_orders", created["id"])
        try:
            await db_delete("schedule_items", task.id)
        except HTTPException:
            pass
        if _media_table_missing(exc):
            raise HTTPException(
                status_code=400,
                detail="The work order wasn't saved because a link was attached and the rental media update hasn't been run yet. Run that migration, then try again. A work order with no link still saves.",
            ) from exc
        raise

    if body.description:
        await create_mention_notifications(
            content=body.description,
            project_id=None,
            source_type="rental_work_order",
            source_id=created["id"],
            message=f"{current_user.name or current_user.email} mentioned you on a work order at {address}: {body.title.strip()}",
            exclude_user_id=current_user.id,
        )
    enriched = await _enrich(rows)
    return enriched[0]


@router.get("/{work_order_id}", response_model=RentalWorkOrderOut)
async def get_work_order(work_order_id: str, _: CurrentUser = Depends(get_current_user)):
    rows = await db_get("rental_work_orders", f"?id=eq.{work_order_id}")
    if not rows:
        raise HTTPException(status_code=404, detail="Work order not found")
    enriched = await _enrich(rows)
    return enriched[0]


@router.get("/{work_order_id}/updates", response_model=list[RentalWorkOrderCommentOut])
async def list_updates(work_order_id: str, _: CurrentUser = Depends(get_current_user)):
    rows = await db_get("rental_work_order_updates", f"?work_order_id=eq.{work_order_id}&order=created_at.asc")
    names = await _names_for([r.get("author_id") for r in rows])
    return [RentalWorkOrderCommentOut(**r, author_name=names.get(r.get("author_id"))) for r in rows]


@router.post("/{work_order_id}/updates", response_model=RentalWorkOrderCommentOut)
async def create_update(
    work_order_id: str, body: RentalWorkOrderCommentCreate, current_user: CurrentUser = Depends(get_current_user)
):
    existing = await db_get("rental_work_orders", f"?id=eq.{work_order_id}&select=id,property_id,title")
    if not existing:
        raise HTTPException(status_code=404, detail="Work order not found")
    current = existing[0]
    text = (body.body or "").strip()
    try:
        links = _links_from(body.links, text)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    # An empty body is allowed: the photos are uploaded next and hang off
    # this row. The screen refuses a completely empty post.
    try:
        rows = await db_post(
            "rental_work_order_updates",
            {"work_order_id": work_order_id, "author_id": current_user.id, "body": text},
        )
    except HTTPException as exc:
        if _media_table_missing(exc):
            raise HTTPException(
                status_code=400,
                detail="Updates need the rental media migration. Run it, then try again.",
            ) from exc
        raise
    comment = rows[0]
    try:
        await _record_links(
            work_order_id,
            current["property_id"],
            text,
            current_user.id,
            links,
            update_id=comment["id"],
        )
    except HTTPException as exc:
        await db_delete("rental_work_order_updates", comment["id"])
        if _media_table_missing(exc):
            raise HTTPException(
                status_code=400,
                detail="That update wasn't saved. The rental media update hasn't been run yet.",
            ) from exc
        raise
    if text:
        address_rows = await db_get("rental_properties", f"?id=eq.{current['property_id']}&select=address")
        address = address_rows[0]["address"] if address_rows else "a rental"
        await create_mention_notifications(
            content=text,
            project_id=None,
            source_type="rental_work_order",
            source_id=work_order_id,
            message=f"{current_user.name or current_user.email} mentioned you on a work order at {address}: {current['title']}",
            exclude_user_id=current_user.id,
        )
    return RentalWorkOrderCommentOut(**comment, author_name=current_user.name)


@router.get("/{work_order_id}/media", response_model=list[RentalWorkOrderMediaOut])
async def list_media(work_order_id: str, _: CurrentUser = Depends(get_current_user)):
    rows = await db_get("rental_work_order_media", f"?work_order_id=eq.{work_order_id}&order=created_at.asc")
    return await _with_download(rows)


@router.post("/{work_order_id}/media/upload-url", response_model=UploadUrlResponse)
async def media_upload_url(
    work_order_id: str, body: RentalWorkOrderUploadRequest, _: CurrentUser = Depends(get_current_user)
):
    existing = await db_get("rental_work_orders", f"?id=eq.{work_order_id}&select=id")
    if not existing:
        raise HTTPException(status_code=404, detail="Work order not found")
    try:
        assert_media_size(body.size_bytes, body.file_name)
        media_kind(body.mime_type, body.file_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    storage_path = f"work-orders/{work_order_id}/{uuid.uuid4()}_{_safe_filename(body.file_name)}"
    upload_url = await create_signed_upload_url(BUCKET, storage_path)
    return UploadUrlResponse(upload_url=upload_url, storage_path=storage_path)


@router.post("/{work_order_id}/media", response_model=RentalWorkOrderMediaOut)
async def create_media(
    work_order_id: str, body: RentalWorkOrderMediaCreate, current_user: CurrentUser = Depends(get_current_user)
):
    existing = await db_get("rental_work_orders", f"?id=eq.{work_order_id}&select=id,property_id,description")
    if not existing:
        raise HTTPException(status_code=404, detail="Work order not found")
    current = existing[0]
    try:
        assert_media_size(body.size_bytes, body.file_name)
        kind = media_kind(body.mime_type, body.file_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    update_text = body.update_text
    if body.update_id and update_text is None:
        comments = await db_get("rental_work_order_updates", f"?id=eq.{body.update_id}&select=body")
        update_text = comments[0]["body"] if comments else None
    if update_text is None:
        update_text = current.get("description")
    row = {
        "work_order_id": work_order_id,
        "property_id": current["property_id"],
        "uploaded_by": current_user.id,
        "kind": kind,
        "file_url": _file_url(body.storage_path),
        "update_text": update_text,
        "file_name": body.file_name,
        "mime_type": body.mime_type,
        "size_bytes": body.size_bytes,
        "storage_path": body.storage_path,
    }
    if body.update_id:
        row["update_id"] = body.update_id
    try:
        rows = await db_post("rental_work_order_media", row)
    except HTTPException as exc:
        if _media_table_missing(exc):
            raise HTTPException(
                status_code=400,
                detail="That photo couldn't be saved. Run the rental media migration, then upload it again.",
            ) from exc
        raise
    enriched = await _with_download(rows)
    return enriched[0]


@router.get("/{work_order_id}/media/{media_id}/download", response_model=DownloadUrlResponse)
async def download_media(work_order_id: str, media_id: str, _: CurrentUser = Depends(get_current_user)):
    """Sanctioned read path for a work-order file. Links return the plain
    URL. Photos and videos return a short-lived signed URL for the private
    rental-files bucket."""
    rows = await db_get("rental_work_order_media", f"?id=eq.{media_id}&work_order_id=eq.{work_order_id}")
    if not rows:
        raise HTTPException(status_code=404, detail="File not found")
    row = rows[0]
    if row.get("link_url"):
        return DownloadUrlResponse(download_url=row["link_url"])
    if not row.get("storage_path"):
        raise HTTPException(status_code=404, detail="File not found")
    download_url = await create_signed_download_url(BUCKET, row["storage_path"])
    return DownloadUrlResponse(download_url=download_url)


@router.patch("/{work_order_id}", response_model=RentalWorkOrderOut)
async def update_work_order(
    work_order_id: str, body: RentalWorkOrderUpdate, current_user: CurrentUser = Depends(get_current_user)
):
    existing = await db_get("rental_work_orders", f"?id=eq.{work_order_id}")
    if not existing:
        raise HTTPException(status_code=404, detail="Work order not found")
    current = existing[0]

    updates = body.model_dump(exclude_unset=True)
    if body.status and body.status != current["status"]:
        updates["resolved_at"] = datetime.now(timezone.utc).isoformat() if body.status == "resolved" else None
        if current.get("task_id") and body.status in _STATUS_TO_TASK_STATUS:
            try:
                await update_task(
                    current["task_id"],
                    TaskUpdate(status=_STATUS_TO_TASK_STATUS[body.status]),
                    current_user=current_user,
                )
            except HTTPException:
                # The linked task may have been deleted independently on the
                # Task Board -- don't let that block the work order's own
                # status update.
                pass

    await db_patch("rental_work_orders", work_order_id, updates)
    rows = await db_get("rental_work_orders", f"?id=eq.{work_order_id}")
    enriched = await _enrich(rows)
    return enriched[0]


@router.delete("/{work_order_id}")
async def delete_work_order(work_order_id: str, _: CurrentUser = Depends(get_current_user)):
    await db_delete("rental_work_orders", work_order_id)
    return {"ok": True}
