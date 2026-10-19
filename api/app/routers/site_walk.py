from typing import Optional

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile

from .. import site_walk
from ..config import settings
from ..deps import CurrentUser, get_current_user
from ..line_items import compute_costs
from ..schemas.site_walk import (
    SiteWalkApplyRequest,
    SiteWalkApplyResponse,
    SiteWalkDraftRequest,
    SiteWalkDraftResponse,
    TranscribeResponse,
)
from ..supabase_client import db_get, db_post_many

router = APIRouter(prefix="/estimates", tags=["site-walk"])


async def _estimate_or_404(estimate_id: str) -> dict:
    rows = await db_get("estimates", f"?id=eq.{estimate_id}&select=id,project_id,projects(name)&limit=1")
    if not rows:
        raise HTTPException(status_code=404, detail="Estimate not found")
    return rows[0]


@router.get("/{estimate_id}/site-walk/status")
async def site_walk_status(estimate_id: str, _: CurrentUser = Depends(get_current_user)):
    """Whether speech-to-text is set up, so the page can offer "paste a
    transcript instead" up front rather than failing after a long upload."""
    return {"transcription_available": bool(settings.openai_api_key)}


@router.post("/{estimate_id}/site-walk/transcribe", response_model=TranscribeResponse)
async def transcribe_piece(
    estimate_id: str,
    audio: UploadFile,
    offset_seconds: float = Form(0),
    _: CurrentUser = Depends(get_current_user),
):
    """One short piece of a video's audio (the browser cuts it into ~2 minute
    pieces so each request stays small). Not stored anywhere."""
    await _estimate_or_404(estimate_id)
    content = await audio.read()
    return await site_walk.transcribe_audio(content, audio.filename or "audio.wav", offset_seconds)


@router.post("/{estimate_id}/site-walk/draft", response_model=SiteWalkDraftResponse)
async def draft_estimate(
    estimate_id: str, body: SiteWalkDraftRequest, _: CurrentUser = Depends(get_current_user)
):
    estimate = await _estimate_or_404(estimate_id)
    existing = await db_get(
        "estimate_line_items", f"?estimate_id=eq.{estimate_id}&order=sort_order.asc&select=title,group_name,bucket"
    )
    cost_codes = await db_get("cost_codes", "?is_active=eq.true&order=code.asc&limit=200&select=id,code,name")
    project_name = ((estimate.get("projects") or {}).get("name") or "this project").split("|")[0].strip()
    return await site_walk.draft_from_walk(body, project_name, existing, cost_codes)


AI_NOTE_PREFIX = "AI draft from site walk"


@router.post("/{estimate_id}/site-walk/apply", response_model=SiteWalkApplyResponse)
async def apply_draft(
    estimate_id: str, body: SiteWalkApplyRequest, _: CurrentUser = Depends(get_current_user)
):
    """Adds the reviewed lines to the estimate, at the end, with no prices (unit
    cost 0) -- each carries an "AI draft" internal note so it can be found and
    checked. One bulk insert, then one totals recalculation."""
    from .estimates import _recalc_estimate_totals

    await _estimate_or_404(estimate_id)
    if not body.items:
        raise HTTPException(status_code=400, detail="No lines to add.")
    valid_codes = {c["id"] for c in await db_get("cost_codes", "?is_active=eq.true&limit=500&select=id")}
    last = await db_get("estimate_line_items", f"?estimate_id=eq.{estimate_id}&select=sort_order&order=sort_order.desc&limit=1")
    next_order = ((last[0].get("sort_order") or 0) + 1) if last else 0

    rows, errors = [], []
    for item in body.items[: site_walk.MAX_ITEMS]:
        title = item.title.strip()
        if not title:
            errors.append("A line with no title was skipped.")
            continue
        builder_cost, owner_price = compute_costs(item.quantity, 0, "percent", 0)
        notes = " -- ".join(
            part for part in (f"{AI_NOTE_PREFIX} ({item.basis}){f' [{item.source}]' if item.source else ''}", item.internal_notes) if part
        )
        rows.append(
            {
                "estimate_id": estimate_id,
                "cost_code_id": item.cost_code_id if item.cost_code_id in valid_codes else None,
                "group_name": (item.group_name or "").strip() or None,
                "bucket": "allowance" if item.is_allowance else "construction",
                "title": title,
                "description": item.description,
                "quantity": item.quantity,
                "unit": item.unit,
                "unit_cost": 0,
                "cost_type": "none",
                "builder_cost": builder_cost,
                "markup_type": "percent",
                "markup_value": 0,
                "owner_price": owner_price,
                "notes_internal": notes,
                "sort_order": next_order + len(rows),
            }
        )
    if rows:
        await db_post_many("estimate_line_items", rows)
        await _recalc_estimate_totals(estimate_id)
    return SiteWalkApplyResponse(added_count=len(rows), errors=errors)
