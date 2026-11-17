"""A viewer can read the API and open file downloads, and nothing else.

The role is the existing app_users.role value "viewer". Almost every route
only checks that someone is logged in, so the block lives here, in front of
all of them, instead of being copied onto each handler.
"""

import re
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from .security import decode_access_token

VIEWER_ROLE = "viewer"
READ_ONLY_DETAIL = "This account is read-only."

# Login and logout have to work or a viewer can neither sign in nor leave.
# Everything else that changes data is rejected.
_ALLOWED_MUTATIONS = {
    "/api/auth/login",
    "/api/auth/logout",
}

# Signed-URL downloads. They are GET today; named here so a non-GET variant
# stays open as well. The bytes come from Storage, not from a database write.
_DOWNLOAD = re.compile(
    r"^/api/(?:rental-files/[^/]+/download|rental-work-orders/[^/]+/media/[^/]+/download)$"
)


def _path(request_path: str) -> str:
    path = request_path.split("?", 1)[0]
    if len(path) > 1:
        path = path.rstrip("/")
    return path


def viewer_must_block(method: str, path: str, role: Optional[str]) -> bool:
    """True when this call should be a 403.

    role is None when there is no usable session (anonymous, cron, Twilio).
    Those requests are left to the route's own check.
    """
    if role != VIEWER_ROLE:
        return False
    if method in ("GET", "HEAD", "OPTIONS"):
        return False
    normalized = _path(path)
    if normalized in _ALLOWED_MUTATIONS or _DOWNLOAD.match(normalized):
        return False
    return True


class ViewerReadOnlyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        role = None
        token = request.cookies.get("session")
        if token:
            payload = decode_access_token(token)
            if payload:
                role = payload.get("role")
        if viewer_must_block(request.method.upper(), request.url.path, role):
            return JSONResponse(status_code=403, content={"detail": READ_ONLY_DETAIL})
        return await call_next(request)
