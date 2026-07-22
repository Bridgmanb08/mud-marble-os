import base64
import hashlib
import hmac
from xml.sax.saxutils import escape

import httpx

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
