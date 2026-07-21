from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user
from ..schemas.project_subcontractor_items import SubItemCreate, SubItemOut, SubItemUpdate
from ..supabase_client import db_delete, db_get, db_patch, db_post

router = APIRouter(tags=["project-subcontractor-items"])

SELECT = "*,subcontractors(company_name,trade)"


@router.get("/projects/{project_id}/subcontractor-items", response_model=list[SubItemOut])
async def list_items(project_id: str, _: CurrentUser = Depends(get_current_user)):
    return await db_get(
        "project_subcontractor_items", f"?project_id=eq.{project_id}&order=sort_order.asc&select={SELECT}"
    )


@router.post("/projects/{project_id}/subcontractor-items", response_model=SubItemOut)
async def create_item(project_id: str, body: SubItemCreate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_post("project_subcontractor_items", {**body.model_dump(), "project_id": project_id})
    full = await db_get("project_subcontractor_items", f"?id=eq.{rows[0]['id']}&select={SELECT}")
    return full[0]


@router.patch("/subcontractor-items/{item_id}", response_model=SubItemOut)
async def update_item(item_id: str, body: SubItemUpdate, _: CurrentUser = Depends(get_current_user)):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    rows = await db_patch("project_subcontractor_items", item_id, updates)
    if not rows:
        raise HTTPException(status_code=404, detail="Item not found")
    full = await db_get("project_subcontractor_items", f"?id=eq.{item_id}&select={SELECT}")
    return full[0]


@router.delete("/subcontractor-items/{item_id}")
async def delete_item(item_id: str, _: CurrentUser = Depends(get_current_user)):
    await db_delete("project_subcontractor_items", item_id)
    return {"ok": True}
