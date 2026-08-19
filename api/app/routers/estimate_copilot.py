import json

from anthropic import AsyncAnthropic
from fastapi import APIRouter, Depends, HTTPException

from ..config import settings
from ..deps import CurrentUser, get_current_user
from ..estimate_copilot_tools import (
    DEPENDENCY_EXAMPLES,
    ESTIMATE_TOOLS,
    WRITE_TOOLS,
    current_estimate_context,
    format_cost_codes,
    format_line_items,
    run_estimate_tool,
)
from ..schemas.ai import ToolCallLog
from ..schemas.estimate_copilot import EstimateCopilotChatRequest, EstimateCopilotChatResponse, NextItemSuggestion

router = APIRouter(prefix="/estimates", tags=["estimate-copilot"])

MODEL = "claude-sonnet-4-6"
MAX_TOOL_ITERATIONS = 6

SYSTEM_PROMPT_TEMPLATE = """You are Mud & Marble's estimating assistant, working alongside {user_name} to \
build out a real construction estimate live, the same way you'd help someone build a document by editing it \
directly and telling them what you did -- not by showing suggestion cards for them to click.

This estimate is for: {project_name} (version {version}).

{dependency_examples}

Available cost codes (id: code - name) -- only use an exact id from this list if you're genuinely confident \
it matches; leave cost_code_id unset rather than guessing:
{cost_codes}

Current line items on this estimate:
{line_items}

How to work:
- Use add_line_item/update_line_item/remove_line_item directly when the user asks you to add, change, or \
remove scope -- don't ask permission first, just do it and say plainly what you did (title, price, which \
group) so it's easy for them to catch anything that needs fixing. This is the same "act, then confirm" \
pattern as every other write action you can already take elsewhere in this app.
- When asked to check the estimate for gaps, walk through what's already there against the complementary-\
scope pairs above and your own construction knowledge, and flag anything that looks missing -- e.g. drywall \
with no paint line, tile with no waterproofing. Ask a clarifying question if you're not sure whether \
something's already covered by an existing group, rather than guessing either way.
- Before proposing a unit cost you're not confident about, use search_reference_line_items to check what \
similar scope has actually cost on other real jobs -- ground pricing in that instead of a generic guess, and \
say when you're doing this.
- If a transcript, scope description, or list of items is pasted into the conversation, extract every \
distinct item as its own line item via add_line_item, using judgment on grouping.
- Keep replies concise -- a short confirmation of what changed, not a long essay. If several things need to \
happen, do them all in one turn rather than asking to proceed step by step, unless something is genuinely \
ambiguous and needs the user's input first.
- You're editing THIS estimate only. Never guess a cost code that isn't in the list above, and never invent \
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
    for _ in range(MAX_TOOL_ITERATIONS):
        response = await client.messages.create(
            model=MODEL,
            max_tokens=2048,
            system=system_prompt,
            tools=ESTIMATE_TOOLS,
            messages=messages,
        )

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
            result = await run_estimate_tool(block.name, block.input, estimate_id)
            tool_log.append(ToolCallLog(name=block.name, input=block.input))
            if block.name in WRITE_TOOLS and not (isinstance(result, dict) and result.get("error")):
                items_changed = True
            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(result, default=str)[:8000],
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

Active cost codes (id: code - name):
{cost_codes}

Based on typical construction sequencing and what's already listed, propose exactly ONE line item that most \
likely comes next -- the single most obvious next thing, given what's already there. Don't suggest something \
already present (check titles/groups carefully), and don't force a suggestion that's too speculative -- if \
nothing obvious comes next, say so honestly rather than reaching.

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
