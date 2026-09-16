from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user
from ..schemas.quotes import QuoteCreate, QuoteOut, QuoteUpdate
from ..supabase_client import db_delete, db_get, db_patch, db_post

router = APIRouter(prefix="/quotes", tags=["quotes"])


@router.get("", response_model=list[QuoteOut])
async def list_quotes(_: CurrentUser = Depends(get_current_user)):
    return await db_get("saved_quotes", "?order=created_at.desc")


@router.post("", response_model=QuoteOut)
async def create_quote(body: QuoteCreate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_post("saved_quotes", body.model_dump(exclude_none=True))
    return rows[0]


@router.patch("/{quote_id}", response_model=QuoteOut)
async def update_quote(quote_id: str, body: QuoteUpdate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_patch("saved_quotes", quote_id, body.model_dump(exclude_unset=True))
    if not rows:
        raise HTTPException(status_code=404, detail="Quote not found")
    return rows[0]


@router.delete("/{quote_id}")
async def delete_quote(quote_id: str, _: CurrentUser = Depends(get_current_user)):
    await db_delete("saved_quotes", quote_id)
    return {"ok": True}
