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
    pulse_workload_rating: Optional[int] = None
    pulse_feeling_stuck: bool = False


TEAM_WORKLOAD_SUMMARY_PROMPT = """You are looking at this week's task load for each person on a small \
residential construction team at Mud & Marble. For each person listed below, write ONE short, specific \
sentence (max ~20 words) capturing how they're doing right now -- grounded in their actual numbers and task \
titles, not generic praise. It's fine to name a real risk (overdue items, a heavy load) as plainly as a good \
manager would, and just as fine to call out when someone's clearly on top of things. Keep the tone direct and \
human, not corporate.

Some people also have a self-reported weekly pulse check-in (workload 1-5, and whether they said they're \
feeling stuck). When that's present, weigh it against their actual task numbers -- call out when the two \
agree (e.g. a heavy self-reported workload that matches a real pile of overdue tasks) or notably disagree \
(e.g. they rated themselves overwhelmed but their task load looks light, or the reverse: task load is heavy \
but they didn't report feeling stuck). Don't force this into every sentence -- only mention it when it adds a \
real insight beyond the task numbers alone.

Team:
{team}

Return ONLY a JSON object mapping each person's exact name (as given) to their one-sentence summary -- no \
markdown, no explanation. Example shape: {{"Shannon": "...", "Brent": "..."}}"""


def _team_workload_text(members: list["TeamMemberBrief"]) -> str:
    lines = []
    for m in members:
        tasks = "; ".join(m.top_task_titles) if m.top_task_titles else "no open tasks"
        pulse_note = ""
        if m.pulse_workload_rating is not None:
            pulse_note = f" Self-reported workload this week: {m.pulse_workload_rating}/5"
            pulse_note += " (said they're feeling stuck)." if m.pulse_feeling_stuck else "."
        lines.append(
            f"- {m.name}: {m.incomplete_count} open, {m.overdue_count} overdue, "
            f"{m.completed_this_week} completed this week. Top tasks: {tasks}.{pulse_note}"
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


class SubInfoEmailDraft(BaseModel):
    subject: str
    body: str


SUB_INFO_EMAIL_PROMPT = """Write a short, friendly, professional email from a residential construction \
general contractor (Mud & Marble) to a subcontractor, requesting the following missing or outdated paperwork:
{missing_items}

Subcontractor: {company_name}{contact_line}{trade_line}

Keep it warm and low-friction -- these are trade partners we want to keep working with, not a compliance \
lecture. One short paragraph is enough. Sign off as "Mud & Marble".

Return ONLY a JSON object with exactly two keys, "subject" and "body" -- no markdown, no explanation. \
Example shape: {{"subject": "...", "body": "..."}}"""


async def draft_sub_info_email(
    company_name: str,
    contact_name: Optional[str],
    trade: Optional[str],
    missing_items: list[str],
) -> SubInfoEmailDraft:
    client = _client()
    message = await client.messages.create(
        model=MODEL,
        max_tokens=512,
        messages=[
            {
                "role": "user",
                "content": SUB_INFO_EMAIL_PROMPT.format(
                    missing_items="\n".join(f"- {item}" for item in missing_items),
                    company_name=company_name,
                    contact_line=f", attn: {contact_name}" if contact_name else "",
                    trade_line=f" ({trade})" if trade else "",
                ),
            }
        ],
    )
    raw = message.content[0].text if message.content else "{}"
    raw = raw.replace("```json", "").replace("```", "").strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ProviderError(f"Response couldn't be parsed as JSON: {e}") from e
    if not isinstance(parsed, dict) or "subject" not in parsed or "body" not in parsed:
        raise ProviderError("Response JSON did not contain subject/body")
    return SubInfoEmailDraft(subject=str(parsed["subject"]), body=str(parsed["body"]))


class SmartNudgeOpenTask(BaseModel):
    title: str
    project_name: Optional[str] = None
    overdue: bool = False
    due_date: Optional[str] = None


class SmartNudgeJobToday(BaseModel):
    project_name: str
    open_task_titles: list[str] = []


class SmartNudgeContext(BaseModel):
    name: str
    kind: Literal["morning_briefing", "job_context", "closeout_briefing"]
    jobs_today: list[SmartNudgeJobToday] = []
    open_tasks: list[SmartNudgeOpenTask] = []
    overdue_count: int = 0
    completed_this_week: int = 0


class SmartNudgeResult(BaseModel):
    message: Optional[str] = None


# One framing sentence per nudge kind, interpolated into the shared prompt below --
# same pattern as DEPENDENCY_EXAMPLES being folded into a shared prompt, so the
# tone/house-style instructions stay in one place instead of drifting across
# three near-duplicate prompts.
_KIND_FRAMING = {
    "morning_briefing": (
        "It's the start of {name}'s day. Give one short, energizing heads-up about what matters most today -- "
        "which job(s) they're at, and anything urgent/overdue they shouldn't lose track of. If there's genuinely "
        'nothing notable (no jobs today, nothing overdue, light load), return {{"message": null}} rather than '
        "manufacturing filler."
    ),
    "job_context": (
        "{name} is at (or scheduled at) {focus_job} today. Remind them, in one short sentence, of the specific "
        "open tasks tied to THIS job that they might otherwise forget while they're on site. If there's nothing "
        'open on this job worth flagging, return {{"message": null}}.'
    ),
    "closeout_briefing": (
        "It's mid-afternoon and {name}'s work day is winding down. Give one short, low-key nudge about anything "
        "still open today that's worth wrapping up before they head out, or a quick nod if they're in good shape. "
        'If there\'s nothing worth flagging, return {{"message": null}}.'
    ),
}

SMART_NUDGE_PROMPT = """You write short, proactive nudges for {name}, a member of a small residential \
construction team at Mud & Marble, based on their real task load and schedule -- never generic filler. Keep \
the tone direct and human, not corporate, max ~20 words, like a sharp PM texting a heads-up, not a notification \
robot.

{framing}

{name}'s current load: {overdue_count} overdue, {completed_this_week} completed this week.
Today's job(s): {jobs_text}
Open tasks: {tasks_text}

Return ONLY a JSON object with exactly one key, "message" -- either a short string, or null if there's nothing \
worth saying. No markdown, no explanation. Example shape: {{"message": "..."}} or {{"message": null}}."""


async def generate_smart_nudge(ctx: SmartNudgeContext, focus_job: Optional[str] = None) -> SmartNudgeResult:
    # Cheap short-circuit before spending a Claude call: nothing to reason about.
    if not ctx.jobs_today and not ctx.open_tasks and ctx.overdue_count == 0:
        return SmartNudgeResult(message=None)

    client = _client()
    framing = _KIND_FRAMING[ctx.kind].format(name=ctx.name, focus_job=focus_job or "a job")
    jobs_text = (
        "; ".join(f"{j.project_name} (open: {', '.join(j.open_task_titles) or 'none'})" for j in ctx.jobs_today)
        or "none scheduled today"
    )
    tasks_text = (
        "; ".join(
            f"{t.title}{' [OVERDUE]' if t.overdue else ''} ({t.project_name or 'no job'})" for t in ctx.open_tasks
        )
        or "none"
    )

    message = await client.messages.create(
        model=MODEL,
        max_tokens=300,
        messages=[
            {
                "role": "user",
                "content": SMART_NUDGE_PROMPT.format(
                    name=ctx.name,
                    framing=framing,
                    overdue_count=ctx.overdue_count,
                    completed_this_week=ctx.completed_this_week,
                    jobs_text=jobs_text,
                    tasks_text=tasks_text,
                ),
            }
        ],
    )
    raw = message.content[0].text if message.content else "{}"
    raw = raw.replace("```json", "").replace("```", "").strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ProviderError(f"Response couldn't be parsed as JSON: {e}") from e
    if not isinstance(parsed, dict):
        raise ProviderError("Response JSON was not an object")
    return SmartNudgeResult(message=parsed.get("message"))
