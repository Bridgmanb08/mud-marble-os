import urllib.parse

import httpx
from fastapi import HTTPException

from .config import settings


def _headers() -> dict:
    return {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
    }


def _storage_base() -> str:
    return f"{settings.supabase_url}/storage/v1"


def _quote_path(path: str) -> str:
    return urllib.parse.quote(path, safe="/")


async def _request(method: str, path: str, **kwargs) -> httpx.Response:
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.request(method, f"{_storage_base()}{path}", headers=_headers(), **kwargs)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach Supabase Storage: {exc}") from exc
    if not r.is_success:
        raise HTTPException(status_code=502, detail=f"Supabase Storage error: {r.text}")
    return r


async def create_signed_upload_url(bucket: str, path: str) -> str:
    r = await _request("POST", f"/object/upload/sign/{bucket}/{_quote_path(path)}")
    data = r.json()
    return f"{settings.supabase_url}/storage/v1/{data['url'].lstrip('/')}"


async def create_signed_download_url(bucket: str, path: str, expires_in: int = 3600) -> str:
    r = await _request(
        "POST", f"/object/sign/{bucket}/{_quote_path(path)}", json={"expiresIn": str(expires_in)}
    )
    data = r.json()
    return f"{settings.supabase_url}/storage/v1{data['signedURL']}"


async def remove_objects(bucket: str, paths: list[str]) -> None:
    await _request("DELETE", f"/object/{bucket}", json={"prefixes": paths})
