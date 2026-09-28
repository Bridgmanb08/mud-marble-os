from typing import Optional

import httpx

from .config import settings


def is_configured() -> bool:
    return bool(settings.resend_api_key)


async def send_email(to: str, subject: str, html: str, text: str) -> Optional[str]:
    """Sends through Resend. Returns None on success, or a short error string
    (never raises) so the caller can record the failure in the send log and
    carry on with the next person."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                json={"from": settings.email_from, "to": [to], "subject": subject, "html": html, "text": text},
            )
    except httpx.HTTPError as exc:
        return f"network error: {exc}"
    if not r.is_success:
        return f"Resend {r.status_code}: {r.text[:300]}"
    return None
