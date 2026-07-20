import httpx
from fastapi import HTTPException

from .config import settings


def _headers() -> dict:
    return {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _base_url() -> str:
    return f"{settings.supabase_url}/rest/v1"


async def _request(method: str, url: str, **kwargs) -> httpx.Response:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.request(method, url, headers=_headers(), **kwargs)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach Supabase: {exc}") from exc
    if not r.is_success:
        raise HTTPException(status_code=502, detail=f"Supabase error: {r.text}")
    return r


async def db_get(table: str, query: str = "") -> list[dict]:
    r = await _request("GET", f"{_base_url()}/{table}{query}")
    return r.json()


async def db_post(table: str, data: dict) -> list[dict]:
    r = await _request("POST", f"{_base_url()}/{table}", json=data)
    return r.json()


async def db_patch(table: str, record_id: str, data: dict) -> list[dict]:
    r = await _request("PATCH", f"{_base_url()}/{table}?id=eq.{record_id}", json=data)
    return r.json()


async def db_patch_query(table: str, query: str, data: dict) -> list[dict]:
    r = await _request("PATCH", f"{_base_url()}/{table}{query}", json=data)
    return r.json()


async def db_delete(table: str, record_id: str) -> None:
    await _request("DELETE", f"{_base_url()}/{table}?id=eq.{record_id}")
