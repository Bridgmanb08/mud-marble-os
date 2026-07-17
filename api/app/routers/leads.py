from fastapi import APIRouter, Depends

from ..deps import CurrentUser, get_current_user
from ..schemas.leads import LeadCreate, LeadOut, LeadUpdate
from ..supabase_client import db_get, db_patch, db_post

router = APIRouter(prefix="/leads", tags=["leads"])


@router.get("", response_model=list[LeadOut])
async def list_leads(_: CurrentUser = Depends(get_current_user)):
    return await db_get("leads", "?order=created_at.desc")


@router.post("", response_model=LeadOut)
async def create_lead(body: LeadCreate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_post("leads", body.model_dump(exclude_none=True))
    return rows[0]


@router.patch("/{lead_id}", response_model=LeadOut)
async def update_lead(lead_id: str, body: LeadUpdate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_patch("leads", lead_id, body.model_dump(exclude_none=True))
    return rows[0]
