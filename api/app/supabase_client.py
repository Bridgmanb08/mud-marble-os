import asyncio
import re
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



# --- Long `id=in.(...)` filters -------------------------------------------------
# A filter like `?task_id=in.(<every task id>)` puts every id in the web address,
# ~37 characters each. Past a few thousand characters the request is rejected
# outright (this is what broke the whole Task Board once an import took the
# number of tasks past ~200). Any such filter is split into batches that each fit,
# the batches are run, and the results put back together -- callers don't change.
_MAX_QUERY_CHARS = 5000
_IN_FILTER = re.compile(r"([?&])([A-Za-z_][\w.]*)=in\.\(([^)]*)\)")


def _split_in_query(query: str) -> Optional[list[str]]:
    """The query split into several shorter ones if it's too long and has a plain
    `col=in.(a,b,c)` filter to split on; None if it fits (or can't be split)."""
    if len(query) <= _MAX_QUERY_CHARS:
        return None
    matches = [m for m in _IN_FILTER.finditer(query) if '"' not in m.group(3)]
    if not matches:
        return None
    m = max(matches, key=lambda x: len(x.group(3)))  # split on the longest filter
    ids = [i for i in m.group(3).split(",") if i]
    if len(ids) < 2:
        return None
    budget = max(500, _MAX_QUERY_CHARS - (len(query) - len(m.group(3))))
    batches: list[list[str]] = []
    current: list[str] = []
    used = 0
    for item in ids:
        if current and used + len(item) + 1 > budget:
            batches.append(current)
            current, used = [], 0
        current.append(item)
        used += len(item) + 1
    if current:
        batches.append(current)
    if len(batches) < 2:
        return None
    return [query[: m.start(3)] + ",".join(b) + query[m.end(3) :] for b in batches]


def _param(query: str, name: str) -> Optional[str]:
    m = re.search(rf"[?&]{name}=([^&]*)", query)
    return m.group(1) if m else None


def _resort(rows: list[dict], query: str) -> list[dict]:
    """Rows from several batches are no longer in the order the one big query
    would have returned them; put them back in the requested `order=`."""
    order = _param(query, "order")
    if not order or not rows:
        return rows
    for part in reversed(order.split(",")):
        bits = part.split(".")
        col, desc = bits[0], "desc" in bits[1:]
        if col not in rows[0]:
            continue  # sorted by something not in the result (e.g. an embedded column) -- leave as is
        present = [r for r in rows if r.get(col) is not None]
        missing = [r for r in rows if r.get(col) is None]
        try:
            present.sort(key=lambda r: r[col], reverse=desc)
        except TypeError:
            continue
        nulls_last = "nullslast" in bits or (not desc and "nullsfirst" not in bits)  # Postgres default: nulls last when ascending, first when descending
        rows = present + missing if nulls_last else missing + present
    return rows


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
    split = _split_in_query(query)
    if split:
        parts = await asyncio.gather(*[db_get(table, q) for q in split])
        merged = _resort([row for part in parts for row in part], query)
        limit = _param(query, "limit")
        return merged[: int(limit)] if limit and limit.isdigit() else merged
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
    split = _split_in_query(query)
    if split:
        results = await asyncio.gather(*[db_patch_query(table, q, data) for q in split])
        return [row for part in results for row in part]
    r = await _request("PATCH", f"{_base_url()}/{table}{query}", json=data)
    return r.json()


async def db_delete(table: str, record_id: str) -> None:
    await _request("DELETE", f"{_base_url()}/{table}?id=eq.{record_id}")


async def db_delete_query(table: str, query: str) -> None:
    """Deletes every row matching an arbitrary filter (e.g. `?id=in.(...)`)
    in a single request, instead of one DELETE per row (several, if the id list is
    too long for one web address)."""
    split = _split_in_query(query)
    if split:
        await asyncio.gather(*[db_delete_query(table, q) for q in split])
        return
    await _request("DELETE", f"{_base_url()}/{table}{query}")
