"""Site walk -> draft estimate. A narrated walk-through video becomes (1) a
transcript, from speech-to-text run on audio the browser cut out of the video,
and (2) still frames the browser sampled; Claude reads both and proposes a
first-pass set of line items for a person to review. Nothing here writes to the
estimate -- applying a draft is its own explicit step."""
import json
import logging
from typing import Any, Optional

import httpx
from anthropic import APIError, AsyncAnthropic, NotFoundError, PermissionDeniedError
from fastapi import HTTPException

from .config import settings
from .schemas.site_walk import DraftItem, SiteWalkDraftRequest, SiteWalkDraftResponse, TranscriptSegment, TranscribeResponse

logger = logging.getLogger(__name__)

WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions"
WHISPER_MODEL = "whisper-1"
MAX_AUDIO_BYTES = 24 * 1024 * 1024  # the API's own limit is 25 MB
MAX_FRAMES = 40
MAX_ITEMS = 60
DRAFT_MODELS = ["claude-sonnet-5", "claude-sonnet-4-6"]
DRAFT_TIMEOUT = 110.0
_unavailable: set[str] = set()

# Names a contractor would actually say, so the transcriber spells them right.
WHISPER_HINT = (
    "Construction job site walk-through: drywall, skim coat, FRP, furring, block wall, vinyl composition tile, LVP, "
    "lay-in ceiling grid, electrical panel, water heater, plumbing, HVAC, rough-in, demo, scope, allowance."
)


def fmt_clock(seconds: float) -> str:
    s = int(max(0, seconds))
    return f"{s // 60}:{s % 60:02d}"


async def transcribe_audio(content: bytes, filename: str, offset_seconds: float = 0) -> TranscribeResponse:
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="Speech-to-text isn't set up yet (OPENAI_API_KEY). You can paste a transcript instead.",
        )
    if len(content) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="That audio piece is too large to transcribe -- try a shorter video.")
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            r = await client.post(
                WHISPER_URL,
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                files={"file": (filename or "audio.wav", content, "audio/wav")},
                data={"model": WHISPER_MODEL, "response_format": "verbose_json", "language": "en", "prompt": WHISPER_HINT},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach the transcription service: {exc}") from exc
    if not r.is_success:
        raise HTTPException(status_code=502, detail=f"Transcription failed: {r.text[:300]}")
    data = r.json()
    segments = [
        TranscriptSegment(start=float(s.get("start", 0)) + offset_seconds, text=(s.get("text") or "").strip())
        for s in data.get("segments") or []
        if (s.get("text") or "").strip()
    ]
    if not segments and (data.get("text") or "").strip():
        segments = [TranscriptSegment(start=offset_seconds, text=data["text"].strip())]
    return TranscribeResponse(text=" ".join(s.text for s in segments), segments=segments)


DRAFT_TOOL = {
    "name": "propose_estimate",
    "description": "Return the first-pass estimate outline for a person to review.",
    "input_schema": {
        "type": "object",
        "properties": {
            "summary": {"type": "string", "description": "Two or three plain sentences: what this job is and its overall scope."},
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "group_name": {"type": "string", "description": "How a contractor would group it: Demo, Framing, Flooring, Paint..."},
                        "cost_code_id": {"type": "string", "description": "An exact id from the cost code list, only if it clearly fits; otherwise omit."},
                        "quantity": {"type": "number", "description": "Only a stated or computable number. If unknown use 1 and unit LS, and say so in internal_notes."},
                        "unit": {"type": "string", "description": "SF, LF, EA, LS, ..."},
                        "description": {"type": "string", "description": "Client-facing scope wording, one or two sentences."},
                        "internal_notes": {"type": "string", "description": "For staff: the math behind a quantity, what is unknown, and the source e.g. [Video 2 0:30]."},
                        "basis": {"type": "string", "enum": ["stated", "inferred", "visual"]},
                        "is_allowance": {"type": "boolean"},
                        "source": {"type": "string", "description": "Where it came from, e.g. Video 2 @0:30"},
                    },
                    "required": ["title", "group_name", "quantity", "basis"],
                },
            },
            "questions": {"type": "array", "items": {"type": "string"}, "description": "Things a person should confirm before pricing."},
        },
        "required": ["summary", "items", "questions"],
    },
}

SYSTEM_PROMPT = """You are Mud & Marble's estimating assistant. A contractor walked a job site recording short narrated \
videos so an estimator can start an estimate. You are given the transcript of what was said (with [m:ss] timestamps) \
and still frames sampled from the footage. Produce a first-pass estimate outline for a person to review.

Rules:
- The narration is the source of truth for scope. Every scope item that was SAID gets a line, with basis "stated".
- Quantities: use a number only if it was stated (e.g. "40x40 floor" = 1,600 SF) or is simple arithmetic on stated \
dimensions -- put the math in internal_notes. If a dimension was not given, use quantity 1, unit "LS", and write what \
is missing in internal_notes (e.g. "wall height not stated"). Never guess a measurement from the footage.
- Never invent prices. This outline has no prices.
- Use the frames to confirm what was said and to notice conditions that were NOT mentioned (water damage, rot, open \
electrical, missing glazing, debris). Add those as separate lines with basis "visual", usually as an allowance \
(is_allowance true) or a line to verify, and say clearly in internal_notes that it was only seen in the footage. Do \
not diagnose with certainty (e.g. say "dark staining, possible past moisture", not "mold").
- Group lines the way a contractor would (Demo, Framing, Flooring, Ceiling & Lighting, Walls & Drywall, Paint, Doors \
& Trim...). If the estimate already has groups, reuse those exact names.
- Do not repeat anything already on the estimate (listed below); add only what is new.
- Cite the source in internal_notes and source as the video and time, e.g. [Video 2 0:30].
- Use a cost_code_id only when it clearly fits one in the list; otherwise leave it out.
- Put anything a person should confirm before pricing (product choices, unknown sizes, things in the footage nobody \
mentioned, building-age hazards like asbestos for older ceilings/floors) in questions.
- The speaker may chat casually or address a friend; ignore that, keep the scope.
- Be concise. Titles are short; descriptions are one or two sentences."""


def _format_existing(items: list[dict]) -> str:
    if not items:
        return "(nothing yet -- this is a new estimate)"
    return "\n".join(f"- {i.get('group_name') or i.get('bucket')}: {i['title']}" for i in items[:80])


def _format_codes(codes: list[dict]) -> str:
    return "\n".join(f"- {c['id']}: {c['code']} - {c['name']}" for c in codes) or "(none)"


def build_user_content(
    body: SiteWalkDraftRequest, project_name: str, existing: list[dict], cost_codes: list[dict]
) -> list[dict]:
    parts: list[dict] = []
    header = (
        f"Job: {project_name}\n\nAlready on this estimate:\n{_format_existing(existing)}\n\n"
        f"Cost codes (id: code - name):\n{_format_codes(cost_codes)}\n"
    )
    parts.append({"type": "text", "text": header})
    for clip in body.clips:
        text = clip.transcript.strip() or "(no speech transcribed)"
        parts.append({"type": "text", "text": f"=== {clip.label} transcript ===\n{text}"})
    if body.notes and body.notes.strip():
        parts.append({"type": "text", "text": f"=== Extra notes from the estimator ===\n{body.notes.strip()}"})
    for frame in body.frames[:MAX_FRAMES]:
        parts.append({"type": "text", "text": f"Frame from {frame.clip} at {fmt_clock(frame.t)}:"})
        parts.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": frame.data}})
    parts.append({"type": "text", "text": "Now call propose_estimate with the outline."})
    return parts


def normalize_draft(raw: dict, cost_codes: list[dict], model: Optional[str]) -> SiteWalkDraftResponse:
    """Whatever the model returned, make it safe to show and apply: only real
    cost code ids, sane numbers, capped lengths."""
    valid_codes = {c["id"] for c in cost_codes}
    items: list[DraftItem] = []
    for it in (raw.get("items") or [])[:MAX_ITEMS]:
        if not isinstance(it, dict) or not str(it.get("title") or "").strip():
            continue
        try:
            qty = float(it.get("quantity", 1))
        except (TypeError, ValueError):
            qty = 1.0
        if qty != qty or qty in (float("inf"), float("-inf")):
            qty = 1.0
        basis = it.get("basis") if it.get("basis") in ("stated", "inferred", "visual") else "inferred"
        code = it.get("cost_code_id")
        items.append(
            DraftItem(
                title=str(it["title"]).strip()[:200],
                group_name=(str(it.get("group_name") or "").strip()[:80] or None),
                cost_code_id=code if code in valid_codes else None,
                quantity=qty,
                unit=(str(it.get("unit") or "").strip()[:20] or None),
                description=(str(it.get("description") or "").strip()[:600] or None),
                internal_notes=(str(it.get("internal_notes") or "").strip()[:800] or None),
                basis=basis,
                is_allowance=bool(it.get("is_allowance")),
                source=(str(it.get("source") or "").strip()[:60] or None),
            )
        )
    questions = [str(q).strip()[:400] for q in (raw.get("questions") or []) if str(q).strip()][:20]
    return SiteWalkDraftResponse(summary=str(raw.get("summary") or "").strip()[:800], items=items, questions=questions, model=model)


async def draft_from_walk(
    body: SiteWalkDraftRequest, project_name: str, existing: list[dict], cost_codes: list[dict]
) -> SiteWalkDraftResponse:
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY is not configured")
    if not any(c.transcript.strip() for c in body.clips) and not body.frames and not (body.notes or "").strip():
        raise HTTPException(status_code=400, detail="Nothing to draft from -- add a video or paste a transcript.")
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    content = build_user_content(body, project_name, existing, cost_codes)
    last_error: Optional[Exception] = None
    for model in DRAFT_MODELS:
        if model in _unavailable:
            continue
        try:
            response = await client.messages.create(
                model=model,
                max_tokens=8000,
                system=SYSTEM_PROMPT,
                tools=[DRAFT_TOOL],
                tool_choice={"type": "tool", "name": "propose_estimate"},
                messages=[{"role": "user", "content": content}],
                timeout=DRAFT_TIMEOUT,
            )
        except (NotFoundError, PermissionDeniedError) as exc:
            _unavailable.add(model)
            last_error = exc
            continue
        except APIError as exc:
            last_error = exc
            continue
        for block in response.content:
            if block.type == "tool_use" and block.name == "propose_estimate":
                return normalize_draft(block.input if isinstance(block.input, dict) else {}, cost_codes, model)
        last_error = RuntimeError("the model did not return an outline")
    detail = getattr(last_error, "message", None) or str(last_error) or "unknown error"
    raise HTTPException(status_code=502, detail=f"The AI service couldn't draft the estimate ({detail[:200]}). Try again in a moment.")
