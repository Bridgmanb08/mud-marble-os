from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends

from ..change_order_utils import compute_sop_breach
from ..deps import CurrentUser, get_current_user
from ..schemas.change_orders import ChangeOrderCreate, ChangeOrderOut, ChangeOrderUpdate
from ..supabase_client import db_get, db_patch, db_post

router = APIRouter(prefix="/change-orders", tags=["change_orders"])


def _attach_breach(co: dict) -> dict:
    now = datetime.now(timezone.utc)
    return {**co, "sop_breach": compute_sop_breach(co.get("status"), co.get("sent_at"), now)}


@router.get("", response_model=list[ChangeOrderOut])
async def list_change_orders(project_id: Optional[str] = None, _: CurrentUser = Depends(get_current_user)):
    query = "?order=created_at.desc&select=*,projects(name)"
    if project_id:
        query += f"&project_id=eq.{project_id}"
    rows = await db_get("change_orders", query)
    return [_attach_breach(r) for r in rows]


@router.post("", response_model=ChangeOrderOut)
async def create_change_order(body: ChangeOrderCreate, _: CurrentUser = Depends(get_current_user)):
    existing = await db_get(
        "change_orders", f"?project_id=eq.{body.project_id}&select=co_number&order=co_number.desc&limit=1"
    )
    next_number = (existing[0]["co_number"] + 1) if existing and existing[0].get("co_number") else 1
    data = body.model_dump(exclude_none=True)
    data["co_number"] = next_number
    data["status"] = "pending"
    data["sent_at"] = datetime.now(timezone.utc).isoformat()
    rows = await db_post("change_orders", data)
    full = await db_get("change_orders", f"?id=eq.{rows[0]['id']}&select=*,projects(name)")
    return _attach_breach(full[0])


@router.patch("/{co_id}", response_model=ChangeOrderOut)
async def update_change_order(co_id: str, body: ChangeOrderUpdate, _: CurrentUser = Depends(get_current_user)):
    await db_patch("change_orders", co_id, body.model_dump(exclude_none=True))
    full = await db_get("change_orders", f"?id=eq.{co_id}&select=*,projects(name)")
    return _attach_breach(full[0])
