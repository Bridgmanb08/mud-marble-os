from typing import Optional

import httpx
from fastapi import HTTPException

from .config import settings

_client: Optional[httpx.AsyncClient] = None


def _headers() -> dict:
    return {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _base_url() -> str:
    return f"{settings.supabase_url}/rest/v1"


def _get_client() -> httpx.AsyncClient:
    """Reuses a single AsyncClient across requests within a warm serverless
    container instead of paying fresh-connection overhead on every call --
    falls back to creating a new one if the previous one got closed out from
    under us (e.g. an event-loop change across invocations)."""
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=15)
    return _client


async def _request(method: str, url: str, extra_headers: Optional[dict] = None, **kwargs) -> httpx.Response:
    try:
        client = _get_client()
        headers = {**_headers(), **(extra_headers or {})}
        r = await client.request(method, url, headers=headers, **kwargs)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach Supabase: {exc}") from exc
    if not r.is_success:
        raise HTTPException(status_code=502, detail=f"Supabase error: {r.text}")
    return r


_PAGE_SIZE = 1000


async def db_get(table: str, query: str = "") -> list[dict]:
    """A table that grows past whatever row cap PostgREST enforces
    (db-max-rows) gets silently truncated on a plain GET -- PostgREST returns
    206 Partial Content, which still counts as a "success" response, so a
    caller with no idea the cap exists just gets fewer rows back than
    actually exist (this is exactly what happened to schedule_items once the
    historical-data backfill pushed it past whatever the configured cap is).
    Page through with Range/Content-Range and an exact count until every row
    has been fetched, unless the caller already specified their own `limit=`
    -- that's an intentional bound, not something to paginate past."""
    if "limit=" in query:
        r = await _request("GET", f"{_base_url()}/{table}{query}")
        return r.json()

    all_rows: list[dict] = []
    offset = 0
    while True:
        r = await _request(
            "GET",
            f"{_base_url()}/{table}{query}",
            extra_headers={
                "Range-Unit": "items",
                "Range": f"{offset}-{offset + _PAGE_SIZE - 1}",
                "Prefer": "return=representation,count=exact",
            },
        )
        page = r.json()
        all_rows.extend(page)
        offset += len(page)

        total = None
        content_range = r.headers.get("content-range", "")
        if "/" in content_range:
            total_part = content_range.rsplit("/", 1)[1]
            if total_part.isdigit():
                total = int(total_part)

        if not page or (total is not None and offset >= total) or (total is None and len(page) < _PAGE_SIZE):
            break
    return all_rows


async def db_post(table: str, data: dict) -> list[dict]:
    r = await _request("POST", f"{_base_url()}/{table}", json=data)
    return r.json()


async def db_post_many(table: str, data: list[dict]) -> list[dict]:
    """Inserts multiple rows in a single request instead of one POST per row."""
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


async def db_delete_query(table: str, query: str) -> None:
    """Deletes every row matching an arbitrary filter (e.g. `?id=in.(...)`)
    in a single request, instead of one DELETE per row."""
    await _request("DELETE", f"{_base_url()}/{table}{query}")
