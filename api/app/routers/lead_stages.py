from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user, require_admin
from ..schemas.lead_stages import LeadStageCreate, LeadStageOut, LeadStageUpdate, _slugify
from ..supabase_client import db_delete, db_get, db_patch, db_post

router = APIRouter(prefix="/lead-stages", tags=["lead-stages"])


@router.get("", response_model=list[LeadStageOut])
async def list_lead_stages(_: CurrentUser = Depends(get_current_user)):
    # Open to any authenticated user -- everyone needs this list to render
    # the Sales stage dropdown on Leads.tsx, not just admins. Only
    # create/update/delete are admin-gated below.
    return await db_get("lead_stages", "?order=sort_order.asc")


@router.post("", response_model=LeadStageOut)
async def create_lead_stage(body: LeadStageCreate, _: CurrentUser = Depends(require_admin)):
    key = body.key.strip() if body.key else _slugify(body.label)
    existing = await db_get("lead_stages", f"?key=eq.{key}&limit=1")
    if existing:
        raise HTTPException(status_code=400, detail=f'A stage with key "{key}" already exists')

    sort_order = body.sort_order
    if sort_order is None:
        current = await db_get("lead_stages", "?order=sort_order.desc&limit=1&select=sort_order")
        sort_order = (current[0]["sort_order"] + 1) if current else 0

    payload = {
        "key": key,
        "label": body.label,
        "sort_order": sort_order,
        "is_open": body.is_open,
        "is_won": body.is_won,
        "is_lost": body.is_lost,
    }
    rows = await db_post("lead_stages", payload)
    return rows[0]


@router.patch("/{stage_id}", response_model=LeadStageOut)
async def update_lead_stage(stage_id: str, body: LeadStageUpdate, _: CurrentUser = Depends(require_admin)):
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    rows = await db_patch("lead_stages", stage_id, updates)
    if not rows:
        raise HTTPException(status_code=404, detail="Stage not found")
    return rows[0]


@router.delete("/{stage_id}")
async def delete_lead_stage(stage_id: str, _: CurrentUser = Depends(require_admin)):
    rows = await db_get("lead_stages", f"?id=eq.{stage_id}&limit=1")
    if not rows:
        raise HTTPException(status_code=404, detail="Stage not found")
    stage = rows[0]
    in_use = await db_get("leads", f"?status=eq.{stage['key']}&limit=1&select=id")
    if in_use:
        raise HTTPException(
            status_code=400,
            detail=f'"{stage["label"]}" is still used by at least one lead -- move those leads to a different stage first.',
        )
    await db_delete("lead_stages", stage_id)
    return {"ok": True}
