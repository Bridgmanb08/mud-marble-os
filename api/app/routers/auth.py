from fastapi import APIRouter, Depends, HTTPException, Response

from ..config import IS_PRODUCTION
from ..deps import CurrentUser, get_current_user
from ..schemas.auth import LoginRequest, UserOut
from ..security import create_access_token, verify_password
from ..supabase_client import db_get

router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE_NAME = "session"
COOKIE_MAX_AGE = 60 * 60 * 24 * 7


@router.post("/login", response_model=UserOut)
async def login(body: LoginRequest, response: Response):
    rows = await db_get("app_users", f"?email=eq.{body.email}&select=*")
    if not rows:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    user = rows[0]
    if not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(user_id=str(user["id"]), email=user["email"], name=user.get("name", ""))
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        secure=IS_PRODUCTION,
        samesite="lax",
        path="/",
    )
    return UserOut(id=str(user["id"]), email=user["email"], name=user.get("name", ""))


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(current_user: CurrentUser = Depends(get_current_user)):
    return UserOut(id=current_user.id, email=current_user.email, name=current_user.name)
