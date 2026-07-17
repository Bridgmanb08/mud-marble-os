from fastapi import HTTPException, Request

from .security import decode_access_token


class CurrentUser:
    def __init__(self, id: str, email: str, name: str):
        self.id = id
        self.email = email
        self.name = name


def get_current_user(request: Request) -> CurrentUser:
    token = request.cookies.get("session")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Session expired or invalid")
    return CurrentUser(id=payload["sub"], email=payload["email"], name=payload.get("name", ""))
