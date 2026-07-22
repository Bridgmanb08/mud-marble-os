from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user, require_admin
from ..schemas.users import PasswordReset, UserCreate, UserDirectoryEntry, UserSummary
from ..security import hash_password
from ..supabase_client import db_get, db_patch, db_post

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserSummary])
async def list_users(_: CurrentUser = Depends(require_admin)):
    return await db_get("app_users", "?select=id,name,email,role,is_admin&order=name.asc")


@router.post("", response_model=UserSummary)
async def create_user(body: UserCreate, _: CurrentUser = Depends(require_admin)):
    existing = await db_get("app_users", f"?email=eq.{body.email}&select=id")
    if existing:
        raise HTTPException(status_code=409, detail="A user with that email already exists")

    rows = await db_post(
        "app_users",
        {
            "name": body.name,
            "email": body.email,
            "password_hash": hash_password(body.password),
            "role": body.role,
            "is_admin": body.is_admin,
        },
    )
    return rows[0]


@router.patch("/{user_id}/password")
async def reset_password(user_id: str, body: PasswordReset, _: CurrentUser = Depends(require_admin)):
    rows = await db_get("app_users", f"?id=eq.{user_id}&select=id")
    if not rows:
        raise HTTPException(status_code=404, detail="User not found")
    await db_patch("app_users", user_id, {"password_hash": hash_password(body.password)})
    return {"ok": True}


@router.get("/directory", response_model=list[UserDirectoryEntry])
async def list_user_directory(_: CurrentUser = Depends(get_current_user)):
    return await db_get("app_users", "?select=id,name&order=name.asc")
