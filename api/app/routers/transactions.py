from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user
from ..schemas.transactions import CostCodeOut, TransactionCreate, TransactionOut, TransactionUpdate
from ..supabase_client import db_delete, db_get, db_patch, db_post

router = APIRouter(prefix="/transactions", tags=["transactions"])

SELECT = "*,projects(name),cost_codes(code,name),subcontractors(company_name,trade)"


@router.get("", response_model=list[TransactionOut])
async def list_transactions(project_id: Optional[str] = None, _: CurrentUser = Depends(get_current_user)):
    query = f"?order=transaction_date.desc&select={SELECT}"
    if project_id:
        query += f"&project_id=eq.{project_id}"
    return await db_get("transactions", query)


@router.post("", response_model=TransactionOut)
async def create_transaction(body: TransactionCreate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_post("transactions", body.model_dump(exclude_none=True))
    full = await db_get("transactions", f"?id=eq.{rows[0]['id']}&select={SELECT}")
    return full[0]


@router.patch("/{transaction_id}", response_model=TransactionOut)
async def update_transaction(transaction_id: str, body: TransactionUpdate, _: CurrentUser = Depends(get_current_user)):
    # exclude_unset (not exclude_none) so explicitly clearing a field back to
    # null -- e.g. un-assigning a cost code or subcontractor -- actually
    # reaches the database, while fields the caller never touched are left
    # alone.
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    rows = await db_patch("transactions", transaction_id, updates)
    if not rows:
        raise HTTPException(status_code=404, detail="Transaction not found")
    full = await db_get("transactions", f"?id=eq.{transaction_id}&select={SELECT}")
    return full[0]


@router.delete("/{transaction_id}")
async def delete_transaction(transaction_id: str, _: CurrentUser = Depends(get_current_user)):
    await db_delete("transactions", transaction_id)
    return {"ok": True}


@router.get("/cost-codes", response_model=list[CostCodeOut])
async def list_cost_codes(_: CurrentUser = Depends(get_current_user)):
    return await db_get("cost_codes", "?is_active=eq.true&order=code.asc&limit=200")
