import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user
from ..schemas.files import DownloadUrlResponse, FileCreate, FileOut, UploadUrlRequest, UploadUrlResponse
from ..storage_client import create_signed_download_url, create_signed_upload_url, remove_objects
from ..supabase_client import db_delete, db_get, db_post

router = APIRouter(tags=["files"])

BUCKET = "project-files"


def _safe_filename(name: str) -> str:
    keep = "".join(c if c.isalnum() or c in "._-" else "_" for c in name)
    return keep or "file"


async def _enrich(rows: list[dict]) -> list[FileOut]:
    if not rows:
        return []
    ids = [r["id"] for r in rows]
    links = await db_get("file_task_links", f"?file_id=in.({','.join(ids)})&select=file_id,task_id")
    task_ids_by_file: dict[str, list[str]] = {}
    for link in links:
        task_ids_by_file.setdefault(link["file_id"], []).append(link["task_id"])
    return [FileOut(**r, task_ids=task_ids_by_file.get(r["id"], [])) for r in rows]


@router.post("/projects/{project_id}/files/upload-url", response_model=UploadUrlResponse)
async def get_upload_url(
    project_id: str,
    body: UploadUrlRequest,
    _: CurrentUser = Depends(get_current_user),
):
    storage_path = f"{project_id}/{uuid.uuid4()}_{_safe_filename(body.file_name)}"
    upload_url = await create_signed_upload_url(BUCKET, storage_path)
    return UploadUrlResponse(upload_url=upload_url, storage_path=storage_path)


@router.post("/projects/{project_id}/files", response_model=FileOut)
async def create_file(
    project_id: str,
    body: FileCreate,
    current_user: CurrentUser = Depends(get_current_user),
):
    rows = await db_post(
        "project_files",
        {
            "project_id": project_id,
            "uploaded_by": current_user.id,
            "file_name": body.file_name,
            "file_type": body.file_type,
            "mime_type": body.mime_type,
            "size_bytes": body.size_bytes,
            "storage_path": body.storage_path,
        },
    )
    file_row = rows[0]
    for task_id in body.task_ids:
        await db_post("file_task_links", {"file_id": file_row["id"], "task_id": task_id})
    enriched = await _enrich([file_row])
    return enriched[0]


@router.get("/projects/{project_id}/files", response_model=list[FileOut])
async def list_files(
    project_id: str,
    file_type: Optional[str] = None,
    task_id: Optional[str] = None,
    _: CurrentUser = Depends(get_current_user),
):
    if task_id:
        links = await db_get("file_task_links", f"?task_id=eq.{task_id}&select=file_id")
        file_ids = [link["file_id"] for link in links]
        if not file_ids:
            return []
        query = f"?id=in.({','.join(file_ids)})&order=created_at.desc"
    else:
        query = f"?project_id=eq.{project_id}&order=created_at.desc"
        if file_type:
            query += f"&file_type=eq.{file_type}"
    rows = await db_get("project_files", query)
    return await _enrich(rows)


@router.get("/files/{file_id}/download", response_model=DownloadUrlResponse)
async def get_download_url(file_id: str, _: CurrentUser = Depends(get_current_user)):
    rows = await db_get("project_files", f"?id=eq.{file_id}")
    if not rows:
        raise HTTPException(status_code=404, detail="File not found")
    download_url = await create_signed_download_url(BUCKET, rows[0]["storage_path"])
    return DownloadUrlResponse(download_url=download_url)


@router.delete("/files/{file_id}")
async def delete_file(file_id: str, _: CurrentUser = Depends(get_current_user)):
    rows = await db_get("project_files", f"?id=eq.{file_id}")
    if not rows:
        raise HTTPException(status_code=404, detail="File not found")
    await remove_objects(BUCKET, [rows[0]["storage_path"]])
    await db_delete("project_files", file_id)
    return {"ok": True}


@router.post("/files/{file_id}/tasks/{task_id}")
async def link_task(file_id: str, task_id: str, _: CurrentUser = Depends(get_current_user)):
    await db_post("file_task_links", {"file_id": file_id, "task_id": task_id})
    return {"ok": True}


@router.delete("/files/{file_id}/tasks/{task_id}")
async def unlink_task(file_id: str, task_id: str, _: CurrentUser = Depends(get_current_user)):
    links = await db_get("file_task_links", f"?file_id=eq.{file_id}&task_id=eq.{task_id}&select=id")
    for link in links:
        await db_delete("file_task_links", link["id"])
    return {"ok": True}
