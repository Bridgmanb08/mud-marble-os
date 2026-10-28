from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user
from ..schemas.foremen import ForemanCreate, ForemanOut, ForemanUpdate
from ..supabase_client import db_delete, db_get, db_patch, db_post

router = APIRouter(prefix="/foremen", tags=["foremen"])


@router.get("", response_model=list[ForemanOut])
async def list_foremen(_: CurrentUser = Depends(get_current_user)):
    return await db_get("foremen", "?order=sort_order.asc,name.asc&limit=200")


async def _name_taken(name: str, except_id: str = "") -> bool:
    rows = await db_get("foremen", "?select=id,name&limit=500")
    return any(r["name"].strip().lower() == name.strip().lower() and r["id"] != except_id for r in rows)


@router.post("", response_model=ForemanOut)
async def create_foreman(body: ForemanCreate, _: CurrentUser = Depends(get_current_user)):
    if await _name_taken(body.name):
        raise HTTPException(status_code=400, detail=f'There is already a foreman named "{body.name}".')
    last = await db_get("foremen", "?select=sort_order&order=sort_order.desc&limit=1")
    sort_order = ((last[0].get("sort_order") or 0) + 1) if last else 0
    rows = await db_post("foremen", {**body.model_dump(), "sort_order": sort_order})
    return rows[0]


@router.patch("/{foreman_id}", response_model=ForemanOut)
async def update_foreman(foreman_id: str, body: ForemanUpdate, _: CurrentUser = Depends(get_current_user)):
    updates = body.model_dump(exclude_unset=True)
    if "name" in updates:
        updates["name"] = updates["name"].strip()
        if not updates["name"]:
            raise HTTPException(status_code=400, detail="Name is required.")
        if await _name_taken(updates["name"], foreman_id):
            raise HTTPException(status_code=400, detail=f'There is already a foreman named "{updates["name"]}".')
    rows = await db_patch("foremen", foreman_id, updates)
    if not rows:
        raise HTTPException(status_code=404, detail="Foreman not found")
    return rows[0]


@router.delete("/{foreman_id}")
async def delete_foreman(foreman_id: str, _: CurrentUser = Depends(get_current_user)):
    """Removes the foreman; any job that had them simply has no foreman afterwards."""
    await db_delete("foremen", foreman_id)
    return {"ok": True}
