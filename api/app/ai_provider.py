import base64
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


def _client() -> AsyncAnthropic:
    if not settings.anthropic_api_key:
        raise ProviderError("ANTHROPIC_API_KEY is not configured")
    return AsyncAnthropic(api_key=settings.anthropic_api_key)


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


# -- scanned/photographed document import --------------------------------
# Everything below reads a document Claude has never seen structured data
# from before -- a photographed or scanned invoice, change order, estimate
# page, or bank statement -- and turns it into the same row shapes the
# deterministic Excel parsers in inhouse_import.py already produce. This is
# the first place in the codebase that sends an image/PDF content block to
# Claude rather than plain text.

_SCAN_MIME_BY_EXT = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
}


def build_scan_content_block(content: bytes, filename: str, content_type: Optional[str] = None) -> dict:
    """An `image` block for jpeg/png, a `document` block for pdf -- Claude reads
    PDF pages natively, no rasterization needed. Raises ProviderError for
    anything else (notably HEIC, which iPhones default to for camera photos
    but which Claude's vision API doesn't accept) rather than sending garbage
    to the API."""
    ext = ("." + filename.rsplit(".", 1)[-1].lower()) if filename and "." in filename else ""
    mime = content_type if content_type in ("application/pdf", "image/jpeg", "image/png") else _SCAN_MIME_BY_EXT.get(ext)
    if not mime:
        raise ProviderError(f"Unsupported scan file type for {filename!r} -- use JPEG, PNG, or PDF (not HEIC)")
    block_type = "document" if mime == "application/pdf" else "image"
    return {
        "type": block_type,
        "source": {"type": "base64", "media_type": mime, "data": base64.b64encode(content).decode()},
    }


def _parse_json_object(raw_text: str) -> dict:
    raw = raw_text.replace("```json", "").replace("```", "").strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ProviderError(f"Response couldn't be parsed as JSON: {e}") from e
    if not isinstance(parsed, dict):
        raise ProviderError("Response JSON was not an object")
    return parsed


_UNCERTAINTY_INSTRUCTIONS = """Never guess a value and report it as confident. If a field is illegible, cut \
off, or genuinely absent, use null (or the stated default) for that field and list its name in \
"uncertain_fields" -- an estimator or bookkeeper will double-check anything flagged there before it's saved, \
so it's always safer to flag uncertainty than to silently invent a number."""


ESTIMATE_SCAN_PROMPT = """You are reading a photographed or scanned page from a construction estimate for \
Mud & Marble, a luxury residential builder, and extracting it into structured line items.

{uncertainty}

Return ONLY a JSON object with this exact structure (no markdown, no explanation):
{{
  "items": [
    {{"title": "Building Permit", "category": "10 - Sitework", "cost_code": "01.05", "quantity": 1, \
"unit_cost": 500, "markup_type": "percent", "markup_value": 15, "description": "City permit fee", \
"confidence": "high", "uncertain_fields": []}}
  ]
}}
`markup_type` is always "percent" or "flat". Default `quantity` to 1 and `markup_type` to "percent" when not \
shown rather than leaving them null. If nothing readable looks like an estimate line item, return {{"items": []}}."""


class EstimateScanItem(BaseModel):
    title: str
    category: Optional[str] = None
    cost_code: Optional[str] = None
    quantity: float = 1
    unit_cost: float = 0
    markup_type: Literal["percent", "flat"] = "percent"
    markup_value: float = 0
    description: Optional[str] = None
    confidence: Literal["high", "low"] = "high"
    uncertain_fields: list[str] = []


async def extract_estimate_from_scan(content_block: dict) -> tuple[list[EstimateScanItem], int]:
    """Returns (items, dropped_count) -- a malformed item is dropped rather
    than failing the whole scan, same graceful-degradation convention as
    extract_estimate_from_transcript."""
    client = _client()
    message = await client.messages.create(
        model=MODEL,
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": [content_block, {"type": "text", "text": ESTIMATE_SCAN_PROMPT.format(uncertainty=_UNCERTAINTY_INSTRUCTIONS)}],
            }
        ],
    )
    raw = message.content[0].text if message.content else "{}"
    parsed = _parse_json_object(raw)
    raw_items = parsed.get("items", [])
    if not isinstance(raw_items, list):
        raise ProviderError("Response JSON did not contain an items list")

    items: list[EstimateScanItem] = []
    dropped = 0
    for raw_item in raw_items:
        try:
            items.append(EstimateScanItem(**raw_item))
        except ValidationError:
            dropped += 1
    return items, dropped


TRANSACTION_SCAN_PROMPT = """You are reading a photographed or scanned bank statement, receipt, or transaction \
list for a construction job at Mud & Marble, and extracting each transaction.

{uncertainty}

Return ONLY a JSON object with this exact structure (no markdown, no explanation):
{{
  "items": [
    {{"date": "2026-06-01", "vendor": "City of Indianapolis", "transaction_type": "expense", "amount": 500, \
"payment_source": "GC Rehab", "description": "Building permit fee", "confidence": "high", "uncertain_fields": []}}
  ]
}}
`date` is always ISO format (YYYY-MM-DD). `transaction_type` is "income" or "expense". `amount` is always \
positive -- the transaction_type conveys direction. If nothing readable looks like a transaction, return \
{{"items": []}}."""


class TransactionScanItem(BaseModel):
    date: str
    vendor: Optional[str] = None
    transaction_type: Literal["income", "expense"] = "expense"
    amount: float
    payment_source: Optional[str] = None
    description: Optional[str] = None
    confidence: Literal["high", "low"] = "high"
    uncertain_fields: list[str] = []


async def extract_transactions_from_scan(content_block: dict) -> tuple[list[TransactionScanItem], int]:
    client = _client()
    message = await client.messages.create(
        model=MODEL,
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": [content_block, {"type": "text", "text": TRANSACTION_SCAN_PROMPT.format(uncertainty=_UNCERTAINTY_INSTRUCTIONS)}],
            }
        ],
    )
    raw = message.content[0].text if message.content else "{}"
    parsed = _parse_json_object(raw)
    raw_items = parsed.get("items", [])
    if not isinstance(raw_items, list):
        raise ProviderError("Response JSON did not contain an items list")

    items: list[TransactionScanItem] = []
    dropped = 0
    for raw_item in raw_items:
        try:
            items.append(TransactionScanItem(**raw_item))
        except ValidationError:
            dropped += 1
    return items, dropped


INVOICE_SCAN_PROMPT = """You are reading a photographed, scanned, or exported invoice for a construction job at \
Mud & Marble, a luxury residential builder, and extracting it into a single structured record.

{uncertainty}

Return ONLY a JSON object with this exact structure (no markdown, no explanation):
{{"invoice_number": "1042", "invoice_type": "progress", "amount_due": 12500.00, "due_date": "2026-07-15", \
"notes_external": "Progress payment 3 of 5", "confidence": "high", "uncertain_fields": []}}
`invoice_type` is one of "progress", "final", "deposit", "retainage", "other" -- default to "progress" if \
unclear. `due_date` is ISO format (YYYY-MM-DD) or null if not shown. `invoice_number` is null if the document \
doesn't clearly show one -- never invent one."""


class InvoiceExtraction(BaseModel):
    invoice_number: Optional[str] = None
    invoice_type: Literal["progress", "final", "deposit", "retainage", "other"] = "progress"
    amount_due: float = 0
    due_date: Optional[str] = None
    notes_external: Optional[str] = None
    confidence: Literal["high", "low"] = "high"
    uncertain_fields: list[str] = []


async def extract_invoice_from_document(content_block: dict) -> InvoiceExtraction:
    """Single object, not a list -- one document produces one row. Unlike the
    list-shaped extractors above, there's nothing to partially salvage, so a
    validation failure raises ProviderError instead of silently dropping."""
    client = _client()
    message = await client.messages.create(
        model=MODEL,
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": [content_block, {"type": "text", "text": INVOICE_SCAN_PROMPT.format(uncertainty=_UNCERTAINTY_INSTRUCTIONS)}],
            }
        ],
    )
    raw = message.content[0].text if message.content else "{}"
    parsed = _parse_json_object(raw)
    try:
        return InvoiceExtraction(**parsed)
    except ValidationError as e:
        raise ProviderError(f"Extracted invoice data didn't match the expected shape: {e}") from e


CHANGE_ORDER_SCAN_PROMPT = """You are reading a photographed, scanned, or exported change order for a \
construction job at Mud & Marble, a luxury residential builder, and extracting it into a single structured \
record.

{uncertainty}

Return ONLY a JSON object with this exact structure (no markdown, no explanation):
{{"title": "Add basement egress window", "co_type": "client_addition", "owner_price": 4200.00, \
"builder_cost": 3100.00, "description": "Client requested an additional egress window in the basement bedroom", \
"discovered_by": "Shannon", "confidence": "high", "uncertain_fields": []}}
`co_type` is one of "client_addition", "selection_upgrade", "field_condition", "other" -- default to \
"client_addition" if unclear. `builder_cost` is our internal cost, `owner_price` is what the client is charged \
-- if only one number is shown, put it in `owner_price` and leave `builder_cost` at 0 with "builder_cost" in \
uncertain_fields. `title` is required -- if no clear title exists, summarize the scope in a few words."""


class ChangeOrderExtraction(BaseModel):
    title: str
    co_type: Literal["client_addition", "selection_upgrade", "field_condition", "other"] = "client_addition"
    owner_price: float = 0
    builder_cost: float = 0
    description: Optional[str] = None
    discovered_by: Optional[str] = None
    confidence: Literal["high", "low"] = "high"
    uncertain_fields: list[str] = []


async def extract_change_order_from_document(content_block: dict) -> ChangeOrderExtraction:
    client = _client()
    message = await client.messages.create(
        model=MODEL,
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": [content_block, {"type": "text", "text": CHANGE_ORDER_SCAN_PROMPT.format(uncertainty=_UNCERTAINTY_INSTRUCTIONS)}],
            }
        ],
    )
    raw = message.content[0].text if message.content else "{}"
    parsed = _parse_json_object(raw)
    try:
        return ChangeOrderExtraction(**parsed)
    except ValidationError as e:
        raise ProviderError(f"Extracted change order data didn't match the expected shape: {e}") from e
