import json
from typing import Literal, Optional

from anthropic import AsyncAnthropic
from pydantic import BaseModel, ValidationError

from .config import settings

MODEL = "claude-sonnet-4-6"


class ProviderError(Exception):
    """Raised when the underlying model call fails or its response can't be
    parsed at all -- callers turn this into an HTTPException. Everything that
    would need to change if a different agent (e.g. Hermes) replaced Claude
    lives in this module; nothing outside it should import anthropic directly
    or know the model name/prompt text."""


class EstimateSuggestion(BaseModel):
    kind: Literal["gap", "transcript_item"]
    title: str
    cost_code_id: Optional[str] = None
    suggested_group_name: Optional[str] = None
    rationale: str
    quantity: Optional[float] = None
    unit: Optional[str] = None
    source_quote: Optional[str] = None


class LineItemBrief(BaseModel):
    title: str
    group_name: Optional[str] = None
    cost_code: Optional[str] = None


class CostCodeBrief(BaseModel):
    id: str
    code: str
    name: str


# A short, hand-maintained set of common complementary-scope pairs, embedded as
# few-shot examples in the prompt rather than a lookup table the code consults --
# this calibrates the model's output to how a real GC actually groups estimate
# line items (which trades imply which follow-on trades) without building a
# rules engine that would need constant upkeep as jobs vary.
DEPENDENCY_EXAMPLES = """Common complementary-scope pairs to watch for (not exhaustive -- use your own
construction knowledge too, but calibrate to examples like these):
- Drywall installed -> paint/finishes usually follow
- Tile -> waterproofing membrane and backer board are usually separate line items
- Framing -> insulation before drywall
- Electrical rough-in -> electrical trim-out/fixtures later
- Plumbing rough-in -> plumbing trim-out/fixtures later
- Exterior siding -> trim and flashing
- Roofing -> gutters
- Demo -> dumpster/debris haul-off"""


def _client() -> AsyncAnthropic:
    if not settings.anthropic_api_key:
        raise ProviderError("ANTHROPIC_API_KEY is not configured")
    return AsyncAnthropic(api_key=settings.anthropic_api_key)


def _catalog_text(cost_code_catalog: list[CostCodeBrief]) -> str:
    if not cost_code_catalog:
        return "(no active cost codes yet)"
    return "\n".join(f"- {c.id}: {c.code} - {c.name}" for c in cost_code_catalog)


def _parse_suggestions(raw_text: str, kind: str) -> list[dict]:
    raw = raw_text.replace("```json", "").replace("```", "").strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ProviderError(f"Response couldn't be parsed as JSON: {e}") from e
    items = parsed.get("suggestions", []) if isinstance(parsed, dict) else parsed
    if not isinstance(items, list):
        raise ProviderError("Response JSON did not contain a suggestions list")
    for item in items:
        item.setdefault("kind", kind)
    return items


GAP_CHECK_PROMPT = """You are reviewing a construction estimate for Mud & Marble, a luxury residential \
builder, looking for likely-missing complementary scope items -- things that are commonly needed \
alongside what's already on the estimate but aren't listed yet.

{examples}

Current line items on this estimate (title, group, cost code if set):
{line_items}

Available cost codes (id: code - name) -- if you're confident a suggestion matches one of these, use its \
exact id; otherwise leave cost_code_id null rather than guessing:
{cost_codes}

Before suggesting something, check whether a group already covers it (e.g. don't suggest "Paint" if a \
"Paint & Finishes" group already has items in it). Only suggest items that are genuinely missing.

Return ONLY a JSON object with this structure (no markdown, no explanation):
{{
  "suggestions": [
    {{"title": "short item title", "cost_code_id": "exact id from the list above, or null", \
"suggested_group_name": "a sensible group name, or null", "rationale": "why this is likely needed"}}
  ]
}}

If nothing looks missing, return {{"suggestions": []}}."""


async def suggest_estimate_gaps(
    line_items: list[LineItemBrief], cost_code_catalog: list[CostCodeBrief]
) -> list[EstimateSuggestion]:
    client = _client()
    items_text = (
        "\n".join(f"- {i.title} (group: {i.group_name or '—'}, cost code: {i.cost_code or '—'})" for i in line_items)
        if line_items
        else "(no line items yet)"
    )
    message = await client.messages.create(
        model=MODEL,
        max_tokens=2048,
        messages=[
            {
                "role": "user",
                "content": GAP_CHECK_PROMPT.format(
                    examples=DEPENDENCY_EXAMPLES,
                    line_items=items_text,
                    cost_codes=_catalog_text(cost_code_catalog),
                ),
            }
        ],
    )
    raw = message.content[0].text if message.content else "{}"
    items = _parse_suggestions(raw, "gap")

    suggestions = []
    for item in items:
        try:
            suggestions.append(EstimateSuggestion(**item))
        except ValidationError:
            continue
    return suggestions


TRANSCRIPT_EXTRACT_PROMPT = """You are reading a jobsite walkthrough transcript for Mud & Marble, a luxury \
residential builder, to suggest estimate line items based on what was discussed, and to flag likely-missing \
complementary scope the transcript implies but doesn't explicitly mention.

{examples}

Available cost codes (id: code - name) -- if you're confident a suggestion matches one of these, use its \
exact id; otherwise leave cost_code_id null rather than guessing:
{cost_codes}

Return ONLY a JSON object with this structure (no markdown, no explanation):
{{
  "suggestions": [
    {{"title": "short item title", "cost_code_id": "exact id from the list above, or null", \
"suggested_group_name": "a sensible group name, or null", "rationale": "why this is suggested", \
"source_quote": "the transcript excerpt this came from, or null if it's an implied gap rather than an explicit mention"}}
  ]
}}

Transcript:
{transcript}"""

MAX_TRANSCRIPT_CHARS = 150_000


async def extract_estimate_from_transcript(
    transcript: str, cost_code_catalog: list[CostCodeBrief]
) -> list[EstimateSuggestion]:
    client = _client()
    message = await client.messages.create(
        model=MODEL,
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": TRANSCRIPT_EXTRACT_PROMPT.format(
                    examples=DEPENDENCY_EXAMPLES,
                    cost_codes=_catalog_text(cost_code_catalog),
                    transcript=transcript[:MAX_TRANSCRIPT_CHARS],
                ),
            }
        ],
    )
    raw = message.content[0].text if message.content else "{}"
    items = _parse_suggestions(raw, "transcript_item")

    suggestions = []
    for item in items:
        try:
            suggestions.append(EstimateSuggestion(**item))
        except ValidationError:
            continue
    return suggestions
