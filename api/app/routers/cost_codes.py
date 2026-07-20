from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, require_admin
from ..schemas.cost_codes import CostCodeCreate, CostCodeOut, CostCodeUpdate
from ..supabase_client import db_get, db_patch, db_post

router = APIRouter(prefix="/cost-codes", tags=["cost-codes"])


@router.get("", response_model=list[CostCodeOut])
async def list_all_cost_codes(_: CurrentUser = Depends(require_admin)):
    return await db_get("cost_codes", "?order=code.asc&limit=500")


@router.post("", response_model=CostCodeOut)
async def create_cost_code(body: CostCodeCreate, _: CurrentUser = Depends(require_admin)):
    rows = await db_post("cost_codes", body.model_dump())
    return rows[0]


@router.patch("/{cost_code_id}", response_model=CostCodeOut)
async def update_cost_code(cost_code_id: str, body: CostCodeUpdate, _: CurrentUser = Depends(require_admin)):
    rows = await db_patch("cost_codes", cost_code_id, body.model_dump(exclude_none=True))
    if not rows:
        raise HTTPException(status_code=404, detail="Cost code not found")
    return rows[0]
