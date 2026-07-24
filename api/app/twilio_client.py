import base64
import hashlib
import hmac
from xml.sax.saxutils import escape

import httpx
from fastapi import HTTPException

from .config import settings


def verify_signature(url: str, params: dict, signature: str) -> bool:
    """Twilio's documented request-validation scheme: HMAC-SHA1 of the webhook URL with
    sorted key+value pairs appended, keyed by the auth token, base64-encoded."""
    if not settings.twilio_auth_token:
        return False
    data = url
    for key in sorted(params.keys()):
        data += key + params[key]
    digest = hmac.new(settings.twilio_auth_token.encode(), data.encode(), hashlib.sha1).digest()
    expected = base64.b64encode(digest).decode()
    return hmac.compare_digest(expected, signature)


async def fetch_media(media_url: str) -> bytes:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(media_url, auth=(settings.twilio_account_sid, settings.twilio_auth_token))
        r.raise_for_status()
        return r.content


def twiml_reply(message: str) -> str:
    return f'<?xml version="1.0" encoding="UTF-8"?><Response><Message>{escape(message)}</Message></Response>'


async def send_sms(to: str, body: str) -> str:
    """Sends a proactive (non-reply) SMS via Twilio's REST API. Returns the MessageSid."""
    if not settings.twilio_account_sid or not settings.twilio_auth_token or not settings.twilio_from_number:
        raise HTTPException(status_code=503, detail="Twilio isn't fully configured (missing account SID, auth token, or from-number)")
    url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Messages.json"
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            url,
            auth=(settings.twilio_account_sid, settings.twilio_auth_token),
            data={"To": to, "From": settings.twilio_from_number, "Body": body},
        )
    if not r.is_success:
        raise HTTPException(status_code=502, detail=f"Twilio send failed: {r.text}")
    return r.json()["sid"]
