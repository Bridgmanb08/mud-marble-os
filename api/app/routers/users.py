from fastapi import APIRouter, Depends

from ..deps import CurrentUser, require_admin
from ..schemas.users import UserSummary
from ..supabase_client import db_get

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserSummary])
async def list_users(_: CurrentUser = Depends(require_admin)):
    return await db_get("app_users", "?select=id,name,email,role&order=name.asc")
