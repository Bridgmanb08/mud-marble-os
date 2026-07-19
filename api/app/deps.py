from fastapi import Depends, HTTPException, Request

from .security import decode_access_token


class CurrentUser:
    def __init__(self, id: str, email: str, name: str, role: str, is_admin: bool):
        self.id = id
        self.email = email
        self.name = name
        self.role = role
        self.is_admin = is_admin


def get_current_user(request: Request) -> CurrentUser:
    token = request.cookies.get("session")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Session expired or invalid")
    return CurrentUser(
        id=payload["sub"],
        email=payload["email"],
        name=payload.get("name", ""),
        role=payload.get("role", "member"),
        is_admin=payload.get("is_admin", False),
    )


def require_admin(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
