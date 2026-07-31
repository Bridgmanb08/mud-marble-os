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
    kind: Literal["gap", "transcript_item"] = "gap"
    title: str
    cost_code_id: Optional[str] = None
    suggested_group_name: Optional[str] = None
    rationale: str
    quantity: Optional[float] = None
    unit: Optional[str] = None
    source_quote: Optional[str] = None


class GapResolution(BaseModel):
    """The payoff of answering one yes/no question (or its follow-up): a short
    verdict, plus a concrete line item to add only when this branch actually
    confirms a gap."""

    advice: str
    suggestion: Optional[EstimateSuggestion] = None


class GapFollowUp(BaseModel):
    """A single deeper yes/no question a branch can lead to -- e.g. "yes, paint
    is priced" -> "does that include ceilings?". Resolves on its own; a
    follow-up never has a further follow-up, which keeps the tree bounded at
    two levels for both response size and a UI that stays a quick click-through."""

    question: str
    yes: GapResolution
    no: GapResolution


class GapBranch(BaseModel):
    advice: str
    suggestion: Optional[EstimateSuggestion] = None
    follow_up: Optional[GapFollowUp] = None


class GapQuestion(BaseModel):
    id: str
    question: str
    context: Optional[str] = None
    yes: GapBranch
    no: GapBranch


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


GAP_CHECK_INSTRUCTIONS = """You are reviewing a construction estimate for Mud & Marble, a luxury residential \
builder. Instead of just listing what might be missing, coach the estimator with short Socratic yes/no \
questions -- each one should be something they can answer just by checking their own scope, and the answer \
itself is what reveals whether there's a real gap.

{examples}

Frame each check as a question where answering "no" reveals a likely gap (pair it with a concrete suggested \
line item), and answering "yes" gives a brief confirmation -- optionally followed by ONE deeper yes/no \
question that probes a more specific risk within that same area (e.g. "yes, paint is priced" -> "does that \
include ceilings, or just walls?"). Keep the tree to at most two levels: the main question, then at most one \
follow-up question per branch, which resolves on its own without spawning a further follow-up.

Before asking about something, check whether a group already covers it (e.g. don't ask about paint if a \
"Paint & Finishes" group already has items in it). Only raise checks that are genuinely worth asking -- 3 to \
6 sharp questions beats a long list of shallow ones.

Available cost codes (id: code - name) -- if you're confident a suggestion matches one of these, use its \
exact id; otherwise leave cost_code_id null rather than guessing:
{cost_codes}

Return ONLY a JSON object with this exact structure (no markdown, no explanation). Here's one fully-worked \
example so you can match the shape and tone:

{{
  "questions": [
    {{
      "id": "paint-after-drywall",
      "context": "Drywall is on the estimate with no finish coat behind it yet.",
      "question": "Have you already priced painting for the areas getting drywalled?",
      "yes": {{
        "advice": "Good -- just double check it covers ceilings, not only walls.",
        "follow_up": {{
          "question": "Does that pricing include ceiling paint, or just the walls?",
          "yes": {{"advice": "You're covered -- nothing to add here."}},
          "no": {{
            "advice": "Ceilings are easy to miss and add real square footage -- worth a separate line.",
            "suggestion": {{"title": "Ceiling paint - drywalled areas", "cost_code_id": null, \
"suggested_group_name": "Paint & Finishes", "rationale": "Ceiling paint is often priced separately from wall \
paint and gets missed."}}
          }}
        }}
      }},
      "no": {{
        "advice": "Drywall without a finish coat is one of the most common estimate gaps -- worth adding now.",
        "suggestion": {{"title": "Paint - drywalled areas", "cost_code_id": null, "suggested_group_name": \
"Paint & Finishes", "rationale": "Drywall is on the estimate but no paint/finish line item follows it yet."}}
      }}
    }}
  ]
}}

A branch only needs "suggestion" when it's confirming a real gap, and only needs "follow_up" when there's a \
genuinely useful deeper question -- most branches will have just one or the other, and "yes" often needs \
neither. If nothing looks worth asking about, return {{"questions": []}}."""

GAP_CHECK_LINE_ITEMS_PROMPT = """Current line items on this estimate (title, group, cost code if set):
{line_items}

Check this specific estimate now."""


def _parse_gap_questions(raw_text: str) -> list[dict]:
    raw = raw_text.replace("```json", "").replace("```", "").strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ProviderError(f"Response couldn't be parsed as JSON: {e}") from e
    items = parsed.get("questions", []) if isinstance(parsed, dict) else parsed
    if not isinstance(items, list):
        raise ProviderError("Response JSON did not contain a questions list")
    return items


async def suggest_estimate_gaps(
    line_items: list[LineItemBrief], cost_code_catalog: list[CostCodeBrief]
) -> list[GapQuestion]:
    client = _client()
    items_text = (
        "\n".join(f"- {i.title} (group: {i.group_name or '—'}, cost code: {i.cost_code or '—'})" for i in line_items)
        if line_items
        else "(no line items yet)"
    )
    # Split into a static block (instructions/examples/cost codes -- identical
    # across repeated gap-checks for this account) and a per-call block (this
    # estimate's own line items). Marking the static block cacheable means a
    # second gap-check within the ~5 min ephemeral-cache window reuses it
    # instead of re-processing the whole prompt, which is most of the latency.
    message = await client.messages.create(
        model=MODEL,
        max_tokens=3000,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": GAP_CHECK_INSTRUCTIONS.format(
                            examples=DEPENDENCY_EXAMPLES, cost_codes=_catalog_text(cost_code_catalog)
                        ),
                        "cache_control": {"type": "ephemeral"},
                    },
                    {
                        "type": "text",
                        "text": GAP_CHECK_LINE_ITEMS_PROMPT.format(line_items=items_text),
                    },
                ],
            }
        ],
    )
    raw = message.content[0].text if message.content else "{}"
    items = _parse_gap_questions(raw)

    questions: list[GapQuestion] = []
    for item in items:
        try:
            questions.append(GapQuestion(**item))
        except ValidationError:
            continue
    return questions


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


class TeamMemberBrief(BaseModel):
    name: str
    incomplete_count: int
    completed_this_week: int
    overdue_count: int
    top_task_titles: list[str]


TEAM_WORKLOAD_SUMMARY_PROMPT = """You are looking at this week's task load for each person on a small \
residential construction team at Mud & Marble. For each person listed below, write ONE short, specific \
sentence (max ~20 words) capturing how they're doing right now -- grounded in their actual numbers and task \
titles, not generic praise. It's fine to name a real risk (overdue items, a heavy load) as plainly as a good \
manager would, and just as fine to call out when someone's clearly on top of things. Keep the tone direct and \
human, not corporate.

Team:
{team}

Return ONLY a JSON object mapping each person's exact name (as given) to their one-sentence summary -- no \
markdown, no explanation. Example shape: {{"Shannon": "...", "Brent": "..."}}"""


def _team_workload_text(members: list["TeamMemberBrief"]) -> str:
    lines = []
    for m in members:
        tasks = "; ".join(m.top_task_titles) if m.top_task_titles else "no open tasks"
        lines.append(
            f"- {m.name}: {m.incomplete_count} open, {m.overdue_count} overdue, "
            f"{m.completed_this_week} completed this week. Top tasks: {tasks}"
        )
    return "\n".join(lines)


async def summarize_team_workload(members: list[TeamMemberBrief]) -> dict[str, str]:
    if not members:
        return {}
    client = _client()
    message = await client.messages.create(
        model=MODEL,
        max_tokens=1024,
        messages=[
            {"role": "user", "content": TEAM_WORKLOAD_SUMMARY_PROMPT.format(team=_team_workload_text(members))}
        ],
    )
    raw = message.content[0].text if message.content else "{}"
    raw = raw.replace("```json", "").replace("```", "").strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ProviderError(f"Response couldn't be parsed as JSON: {e}") from e
    if not isinstance(parsed, dict):
        raise ProviderError("Response JSON was not an object mapping names to summaries")
    return {str(k): str(v) for k, v in parsed.items()}
