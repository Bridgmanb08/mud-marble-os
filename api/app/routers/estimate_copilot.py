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
from ..schemas.estimate_copilot import EstimateCopilotChatRequest, EstimateCopilotChatResponse

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
