import json
import time

from anthropic import APIError, AsyncAnthropic, BadRequestError, NotFoundError, PermissionDeniedError
from fastapi import APIRouter, Depends, HTTPException

from ..config import settings
from ..deps import CurrentUser, get_current_user
from ..estimate_copilot_tools import (
    DEPENDENCY_EXAMPLES,
    ESTIMATE_TOOLS,
    WRITE_TOOLS,
    current_estimate_context,
    format_change_orders,
    format_cost_codes,
    format_line_items,
    run_estimate_tool,
)
from ..schemas.ai import ToolCallLog
from ..schemas.estimate_copilot import EstimateCopilotChatRequest, EstimateCopilotChatResponse, NextItemSuggestion

router = APIRouter(prefix="/estimates", tags=["estimate-copilot"])

# The ambient "what comes next" hint fires after every line item add, so it
# stays on the faster model.
MODEL = "claude-sonnet-4-6"
# The conversational copilot does the real estimating work, so it runs on the
# stronger model. Any model that isn't available to this API key is skipped
# and the next one down is used, so a model name can never break the panel.
COPILOT_MODEL = "claude-sonnet-5"
# "Think harder" mode: the strongest model plus extended thinking.
DEEP_MODEL = "claude-opus-5"
THINKING_BUDGET = 6000
DEEP_MAX_TOKENS = 12000
# Think harder is slow, and the whole request has to finish inside the server's
# time limit -- a request that runs out of time comes back as an empty error
# with nothing for the person to act on. So the deep model gets a bounded time
# per call, and once the whole reply has used up DEEP_TIME_BUDGET it finishes
# on the regular model instead of starting another slow call.
DEEP_CALL_TIMEOUT = 45.0
DEEP_TIME_BUDGET = 40.0
MAX_TOOL_ITERATIONS = 12
MAX_TOKENS = 4096
TOOL_RESULT_CHARS = 16000
_unavailable_models: set[str] = set()
_thinking_supported = True


def _strip_thinking(messages: list[dict]) -> list[dict]:
    out = []
    for m in messages:
        content = m.get("content")
        if m.get("role") == "assistant" and isinstance(content, list):
            content = [b for b in content if b.get("type") not in ("thinking", "redacted_thinking")]
            m = {**m, "content": content}
        out.append(m)
    return out


async def _create_message(client: AsyncAnthropic, deep: bool = False, **kwargs):
    """One model call, walking down the model list until one works. In deep
    mode the first attempt uses the strongest model with extended thinking; if
    the API rejects thinking (the model or SDK doesn't support it) it's
    switched off and the call retried, and if the deep model is unavailable,
    overloaded, or too slow, the call is made on the regular model instead --
    ticking Think harder can make an answer better but never makes it fail."""
    global _thinking_supported
    chain = ([DEEP_MODEL] if deep else []) + [COPILOT_MODEL, MODEL]
    for model in chain[:-1]:
        if model in _unavailable_models:
            continue
        is_deep_model = deep and model == DEEP_MODEL
        try:
            if is_deep_model and _thinking_supported:
                try:
                    return await client.messages.create(
                        model=model,
                        extra_body={"thinking": {"type": "enabled", "budget_tokens": THINKING_BUDGET}},
                        timeout=DEEP_CALL_TIMEOUT,
                        **{**kwargs, "max_tokens": max(kwargs.get("max_tokens", 0), DEEP_MAX_TOKENS)},
                    )
                except BadRequestError:
                    _thinking_supported = False
            if is_deep_model:
                return await client.messages.create(
                    model=model, timeout=DEEP_CALL_TIMEOUT, **{**kwargs, "messages": _strip_thinking(kwargs["messages"])}
                )
            return await client.messages.create(model=model, **{**kwargs, "messages": _strip_thinking(kwargs["messages"])})
        except (NotFoundError, PermissionDeniedError):
            _unavailable_models.add(model)
        except APIError:
            # Overloaded, rate limited, timed out, or a server error. Not a
            # reason to mark the model gone for good -- just answer this one
            # on the next model down.
            if not is_deep_model:
                raise
    return await client.messages.create(model=chain[-1], **{**kwargs, "messages": _strip_thinking(kwargs["messages"])})


SYSTEM_PROMPT_TEMPLATE = """You are Mud & Marble's estimating assistant, working alongside {user_name} to \
build out a real construction estimate live, the same way you'd help someone build a document by editing it \
directly and telling them what you did -- not by showing suggestion cards for them to click.

This estimate is for: {project_name} (version {version}).

You are built on Claude, a model made by Anthropic. If anyone asks what powers you, say so plainly.

{dependency_examples}

Available cost codes (id: code - name) -- only use an exact id from this list if you're genuinely confident \
it matches; leave cost_code_id unset rather than guessing:
{cost_codes}

Current line items on this estimate:
{line_items}

Approved change orders on this project -- already-agreed scope beyond this base estimate. You can't edit \
these (add_line_item/update_line_item/remove_line_item only ever touch THIS estimate), but check them before \
adding scope or flagging a gap, so you don't propose something that's already been added as a change order or \
contradict what's already been agreed to:
{change_orders}

How pricing works in this app -- get this right when you create or change a line:
- builder cost = quantity x unit cost. The unit cost can be split into labor and material (unit_cost_labor + \
unit_cost_material); when you know the split, use it, since the in-house sheets track labor and material separately.
- The client price adds a markup to the builder cost, one of three kinds: "percent" (a % on top), "flat" (one \
dollar amount for the whole line, NOT per unit), or "per_unit" (dollars of profit PER UNIT of quantity -- e.g. \
$6 per unit on 2,625 units is $15,750 of profit). A line priced by profit-per-unit must use per_unit; a flat \
markup there would silently mean "$6 total". Never compute builder_cost or owner_price yourself.
- Profit is price minus builder cost; margin is profit divided by client price. The line items above already \
show each line's margin. For totals and margins by group or bucket, call get_estimate_summary rather than \
adding up numbers yourself.

Beyond this estimate -- you can look into the whole business, read-only:
- search_projects, search_estimates, search_change_orders, search_invoices, search_transactions, search_tasks, \
search_clients, search_subcontractors, search_leads, and get_dashboard_summary answer questions about any job, \
client, bill, expense, task, or lead -- "which jobs are over budget", "what's outstanding on invoices", \
"how are our active jobs doing". get_project_overview gives one job's full picture (estimates, change orders, \
invoices, collected, profit, budget vs actual, schedule); get_estimate_line_items reads any other estimate's \
lines. Find ids with a search first.
- For questions about other jobs, look it up -- don't answer from memory or guess -- and say which job or \
estimate each number came from. Everything you can do outside this estimate is read-only; add/update/remove only \
ever change THIS estimate.
- For a question that spans several jobs, make as many lookups as it takes, then actually reason over what you \
found: compare, rank, spot what's off, and give a clear answer and recommendation, not a pile of data.

How to work:
- Use add_line_items (several at once) or add_line_item, and update_line_item / update_line_items (the same \
change across a group, bucket, or list), and remove_line_item, directly when the user asks you to add, change, or \
remove scope -- don't ask permission first, just do it and say plainly what you did (title, price, which \
group) so it's easy for them to catch anything that needs fixing. This is the same "act, then confirm" \
pattern as every other write action you can already take elsewhere in this app.
- When asked to check the estimate for gaps, walk through what's already there against the complementary-\
scope pairs above and your own construction knowledge, and flag anything that looks missing -- e.g. drywall \
with no paint line, tile with no waterproofing. Ask a clarifying question if you're not sure whether \
something's already covered by an existing group, rather than guessing either way.
- Before proposing a unit cost you're not confident about, use get_cost_code_pricing (min / median / max cost \
and typical margin across other jobs, closed ones included) or search_reference_line_items to see what similar \
scope has actually cost on real jobs -- ground pricing in that instead of a generic guess, and say when you're \
doing this. When asked whether the estimate is priced well, compare its lines against get_cost_code_pricing \
and name the ones that look high, low, or thin on margin.
- Use get_project_context when the job itself matters (its address, status, other versions of this estimate, \
change orders), and update_estimate_details to edit the proposal's title, intro/closing text, internal notes, \
or approval deadline.
- If a transcript, scope description, or list of items is pasted into the conversation, extract every \
distinct item as its own line item with ONE add_line_items call, using judgment on grouping.
- Keep replies concise -- a short confirmation of what changed, not a long essay. If several things need to \
happen, do them all in one turn rather than asking to proceed step by step, unless something is genuinely \
ambiguous and needs the user's input first.
- You're editing THIS estimate only (other jobs are read-only to you). Never guess a cost code that isn't in the list above, and never invent \
prices with no basis -- ask or search when you're not confident."""


async def _load_system_prompt(estimate_id: str, user_name: str) -> str:
    from .estimates import get_estimate

    # get_estimate returns a plain dict when called directly like this
    # (built from a db_get row, not constructed as an EstimateOut instance
    # in its own body) -- response_model coercion only happens at the HTTP
    # layer, which this direct call bypasses. Also doubles as our 404 check
    # for a bad estimate_id, since it raises HTTPException itself.
    estimate = await get_estimate(estimate_id, None)
    ctx = await current_estimate_context(estimate_id)
    project = estimate.get("projects") or {}
    return SYSTEM_PROMPT_TEMPLATE.format(
        user_name=user_name,
        project_name=project.get("name") or "this project",
        version=estimate.get("version"),
        dependency_examples=DEPENDENCY_EXAMPLES,
        cost_codes=format_cost_codes(ctx["cost_codes"]),
        line_items=format_line_items(ctx["items"]),
        change_orders=format_change_orders(ctx["change_orders"]),
    )


@router.post("/{estimate_id}/copilot/chat", response_model=EstimateCopilotChatResponse)
async def copilot_chat(
    estimate_id: str, body: EstimateCopilotChatRequest, current_user: CurrentUser = Depends(get_current_user)
):
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY is not configured")

    system_prompt = await _load_system_prompt(estimate_id, current_user.name)

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    messages: list[dict] = [{"role": m.role, "content": m.content} for m in body.history]
    messages.append({"role": "user", "content": body.message})

    tool_log: list[ToolCallLog] = []
    items_changed = False
    started = time.monotonic()
    for _ in range(MAX_TOOL_ITERATIONS):
        # Once the time budget is spent, finish on the regular model.
        deep_now = body.deep and (time.monotonic() - started) < DEEP_TIME_BUDGET
        try:
            response = await _create_message(
                client,
                deep=deep_now,
                max_tokens=MAX_TOKENS,
                system=system_prompt,
                tools=ESTIMATE_TOOLS,
                messages=messages,
            )
        except APIError as exc:
            # Say what happened instead of letting it become an empty 500.
            raise HTTPException(
                status_code=502,
                detail=f"The AI service had a problem ({type(exc).__name__}: {getattr(exc, 'message', str(exc))[:200]}). "
                "Try again in a moment" + (", or untick Think harder." if body.deep else "."),
            ) from exc

        if response.stop_reason != "tool_use":
            reply = "".join(b.text for b in response.content if b.type == "text")
            return EstimateCopilotChatResponse(
                reply=reply or "I'm not sure how to help with that -- try rephrasing?",
                tool_calls=tool_log,
                items_changed=items_changed,
            )

        messages.append({"role": "assistant", "content": [b.model_dump() for b in response.content]})
        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            result = await run_estimate_tool(block.name, block.input, estimate_id, current_user)
            tool_log.append(ToolCallLog(name=block.name, input=block.input))
            if block.name in WRITE_TOOLS and not (isinstance(result, dict) and result.get("error")):
                items_changed = True
            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(result, default=str)[:TOOL_RESULT_CHARS],
                }
            )
        messages.append({"role": "user", "content": tool_results})

    return EstimateCopilotChatResponse(
        reply="That needed more back-and-forth than I could finish in one go -- try breaking it into smaller asks.",
        tool_calls=tool_log,
        items_changed=items_changed,
    )


SUGGEST_NEXT_PROMPT = """You're helping build a real construction estimate for Mud & Marble, a luxury \
residential builder, thinking like an experienced GC about what naturally comes next in the build sequence.

{dependency_examples}

Current line items on this estimate, in the order they were added:
{line_items}

Approved change orders on this project (already-agreed extra scope -- don't suggest something already \
covered by one of these):
{change_orders}

Active cost codes (id: code - name):
{cost_codes}

Based on typical construction sequencing and what's already listed, propose exactly ONE line item that most \
likely comes next -- the single most obvious next thing, given what's already there. Don't suggest something \
already present (check titles/groups AND the approved change orders above carefully), and don't force a \
suggestion that's too speculative -- if nothing obvious comes next, say so honestly rather than reaching.

Return ONLY a JSON object, no markdown, no explanation:
{{"title": "...", "group_name": "an existing group this belongs with, or a sensible new one", "cost_code_id": \
"exact id from the list above if confident, else null", "rationale": "one short sentence why this is next"}}
or, if nothing obvious comes next:
{{"title": null}}"""


@router.post("/{estimate_id}/copilot/suggest-next", response_model=NextItemSuggestion)
async def suggest_next_item(estimate_id: str, current_user: CurrentUser = Depends(get_current_user)):
    """Ambient "what comes next" hint shown as a gray ghost row while someone
    builds an estimate -- fires automatically after every line item add, not
    a user-initiated action, so it follows the same silent-fail contract as
    the Phase 13 smart nudges (no key / parse failure / nothing obvious ->
    an empty NextItemSuggestion, never an HTTPException the frontend has to
    surface as an error toast)."""
    if not settings.anthropic_api_key:
        return NextItemSuggestion()

    ctx = await current_estimate_context(estimate_id)
    if not ctx["items"]:
        # Nothing built yet to sequence off of -- don't guess a starting
        # point out of thin air.
        return NextItemSuggestion()

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    try:
        message = await client.messages.create(
            model=MODEL,
            max_tokens=400,
            messages=[
                {
                    "role": "user",
                    "content": SUGGEST_NEXT_PROMPT.format(
                        dependency_examples=DEPENDENCY_EXAMPLES,
                        line_items=format_line_items(ctx["items"]),
                        cost_codes=format_cost_codes(ctx["cost_codes"]),
                    ),
                }
            ],
        )
        raw = "".join(b.text for b in message.content if b.type == "text")
        raw = raw.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(raw)
    except Exception:
        return NextItemSuggestion()

    title = parsed.get("title")
    if not title:
        return NextItemSuggestion()

    cost_code_id = parsed.get("cost_code_id") or None
    suggestion = NextItemSuggestion(
        title=title,
        group_name=parsed.get("group_name") or None,
        cost_code_id=cost_code_id,
        rationale=parsed.get("rationale") or None,
    )

    # Ground the unit cost in what this has actually cost on real jobs,
    # instead of leaving the user to guess blind -- same "search before
    # proposing a number" rule the chat copilot's own system prompt already
    # follows. Best-effort: a lookup failure just means no price hint, not a
    # broken suggestion.
    try:
        from .estimates import search_line_items

        results = await search_line_items(
            cost_code_id=cost_code_id,
            q=None if cost_code_id else title,
            exclude_estimate_id=estimate_id,
            _=current_user,
        )
        costs = [r.unit_cost for r in results if r.unit_cost]
        if costs:
            suggestion.suggested_unit_cost = round(sum(costs) / len(costs), 2)
            suggestion.cost_sample_size = len(costs)
    except Exception:
        pass

    return suggestion
