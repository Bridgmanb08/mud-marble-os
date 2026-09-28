import hmac

from fastapi import APIRouter, HTTPException, Request

from ..config import settings
from ..notification_tick import run_tick

router = APIRouter(prefix="/cron", tags=["cron"])


def _check_secret(request: Request) -> None:
    if not settings.cron_secret:
        raise HTTPException(status_code=503, detail="CRON_SECRET is not configured")
    supplied = request.headers.get("authorization", "")
    if not hmac.compare_digest(supplied, f"Bearer {settings.cron_secret}"):
        raise HTTPException(status_code=401, detail="Unauthorized")


# GET as well as POST: Vercel Cron always calls with GET, Supabase pg_net can
# use either. Both authenticate with the same bearer secret.
@router.api_route("/notifications-tick", methods=["GET", "POST"])
async def notifications_tick(request: Request):
    _check_secret(request)
    return await run_tick()
