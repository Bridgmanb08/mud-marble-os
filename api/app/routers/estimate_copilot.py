from fastapi import APIRouter, Depends, HTTPException

from ..ai_provider import (
    CostCodeBrief,
    LineItemBrief,
    ProviderError,
    extract_estimate_from_transcript,
    suggest_estimate_gaps,
)
from ..deps import CurrentUser, get_current_user
from ..estimate_suggestion_spec import validate_suggestions
from ..schemas.estimate_copilot import GapCheckResponse, TranscriptExtractRequest, TranscriptExtractResponse
from ..supabase_client import db_get

router = APIRouter(prefix="/estimates", tags=["estimate-copilot"])


async def _active_cost_codes() -> list[CostCodeBrief]:
    rows = await db_get("cost_codes", "?is_active=eq.true&order=code.asc&limit=200&select=id,code,name")
    return [CostCodeBrief(**r) for r in rows]


@router.post("/{estimate_id}/copilot/gap-check", response_model=GapCheckResponse)
async def gap_check(estimate_id: str, _: CurrentUser = Depends(get_current_user)):
    rows = await db_get(
        "estimate_line_items", f"?estimate_id=eq.{estimate_id}&select=title,group_name,cost_codes(code)"
    )
    line_items = [
        LineItemBrief(title=r["title"], group_name=r.get("group_name"), cost_code=(r.get("cost_codes") or {}).get("code"))
        for r in rows
    ]
    cost_codes = await _active_cost_codes()

    try:
        suggestions = await suggest_estimate_gaps(line_items, cost_codes)
    except ProviderError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    valid_ids = {c.id for c in cost_codes}
    accepted, dropped = validate_suggestions(suggestions, valid_ids)
    return GapCheckResponse(suggestions=accepted, dropped=dropped)


@router.post("/{estimate_id}/copilot/transcript-extract", response_model=TranscriptExtractResponse)
async def transcript_extract(
    estimate_id: str, body: TranscriptExtractRequest, _: CurrentUser = Depends(get_current_user)
):
    if not body.transcript.strip():
        raise HTTPException(status_code=400, detail="Transcript can't be empty")

    cost_codes = await _active_cost_codes()
    try:
        suggestions = await extract_estimate_from_transcript(body.transcript, cost_codes)
    except ProviderError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    valid_ids = {c.id for c in cost_codes}
    accepted, dropped = validate_suggestions(suggestions, valid_ids)
    return TranscriptExtractResponse(suggestions=accepted, dropped=dropped)
