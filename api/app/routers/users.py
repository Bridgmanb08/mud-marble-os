from fastapi import APIRouter, Depends

from ..deps import CurrentUser, get_current_user, require_admin
from ..schemas.users import UserDirectoryEntry, UserSummary
from ..supabase_client import db_get

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserSummary])
async def list_users(_: CurrentUser = Depends(require_admin)):
    return await db_get("app_users", "?select=id,name,email,role&order=name.asc")


@router.get("/directory", response_model=list[UserDirectoryEntry])
async def list_user_directory(_: CurrentUser = Depends(get_current_user)):
    return await db_get("app_users", "?select=id,name&order=name.asc")
