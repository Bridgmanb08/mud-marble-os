from fastapi import APIRouter, Depends

from .. import deleted_records
from ..deps import CurrentUser, get_current_user

router = APIRouter(prefix="/deleted-records", tags=["deleted-records"])


@router.get("")
async def list_deleted_records(kind: str = "estimate", _: CurrentUser = Depends(get_current_user)):
    return await deleted_records.list_deleted(kind)


@router.post("/{record_id}/restore")
async def restore_deleted_record(record_id: str, _: CurrentUser = Depends(get_current_user)):
    return await deleted_records.restore_estimate(record_id)
