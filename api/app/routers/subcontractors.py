from fastapi import APIRouter, Depends

from ..deps import CurrentUser, get_current_user
from ..schemas.subcontractors import SubcontractorCreate, SubcontractorOut, SubcontractorUpdate
from ..supabase_client import db_get, db_patch, db_post

router = APIRouter(prefix="/subcontractors", tags=["subcontractors"])


@router.get("", response_model=list[SubcontractorOut])
async def list_subcontractors(_: CurrentUser = Depends(get_current_user)):
    return await db_get("subcontractors", "?order=company_name.asc")


@router.post("", response_model=SubcontractorOut)
async def create_subcontractor(body: SubcontractorCreate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_post("subcontractors", body.model_dump(exclude_none=True))
    return rows[0]


@router.patch("/{subcontractor_id}", response_model=SubcontractorOut)
async def update_subcontractor(
    subcontractor_id: str, body: SubcontractorUpdate, _: CurrentUser = Depends(get_current_user)
):
    rows = await db_patch("subcontractors", subcontractor_id, body.model_dump(exclude_none=True))
    return rows[0]
