from typing import Optional

from fastapi import APIRouter, Depends

from ..deps import CurrentUser, get_current_user
from ..schemas.estimates import EstimateCreate, EstimateOut, LineItemCreate, LineItemOut
from ..supabase_client import db_get, db_post

router = APIRouter(prefix="/estimates", tags=["estimates"])


@router.get("", response_model=list[EstimateOut])
async def list_estimates(project_id: Optional[str] = None, _: CurrentUser = Depends(get_current_user)):
    query = "?order=created_at.desc"
    if project_id:
        query += f"&project_id=eq.{project_id}"
    return await db_get("estimates", query)


@router.post("", response_model=EstimateOut)
async def create_estimate(body: EstimateCreate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_post("estimates", body.model_dump(exclude_none=True))
    estimate = rows[0]
    if body.pm_fee_total > 0:
        await db_post(
            "estimate_line_items",
            {
                "estimate_id": estimate["id"],
                "bucket": "pm_fee",
                "description": "Project management fee",
                "owner_price": body.pm_fee_total,
                "builder_cost": body.pm_fee_total,
                "sort_order": 1,
            },
        )
    return estimate


@router.get("/{estimate_id}/items", response_model=list[LineItemOut])
async def list_line_items(estimate_id: str, _: CurrentUser = Depends(get_current_user)):
    return await db_get("estimate_line_items", f"?estimate_id=eq.{estimate_id}&order=sort_order.asc")


@router.post("/{estimate_id}/items", response_model=LineItemOut)
async def create_line_item(estimate_id: str, body: LineItemCreate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_post("estimate_line_items", {"estimate_id": estimate_id, **body.model_dump(exclude_none=True)})
    return rows[0]
