from fastapi import APIRouter, Depends

from ..deps import CurrentUser, get_current_user
from ..schemas.transactions import CostCodeOut, TransactionCreate, TransactionOut
from ..supabase_client import db_get, db_post

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("", response_model=list[TransactionOut])
async def list_transactions(_: CurrentUser = Depends(get_current_user)):
    return await db_get(
        "transactions", "?order=transaction_date.desc&select=*,projects(name),cost_codes(code,name)"
    )


@router.post("", response_model=TransactionOut)
async def create_transaction(body: TransactionCreate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_post("transactions", body.model_dump(exclude_none=True))
    full = await db_get(
        "transactions", f"?id=eq.{rows[0]['id']}&select=*,projects(name),cost_codes(code,name)"
    )
    return full[0]


@router.get("/cost-codes", response_model=list[CostCodeOut])
async def list_cost_codes(_: CurrentUser = Depends(get_current_user)):
    return await db_get("cost_codes", "?is_active=eq.true&order=code.asc&limit=200")
