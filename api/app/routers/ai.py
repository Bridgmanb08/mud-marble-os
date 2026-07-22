import json

from anthropic import AsyncAnthropic
from fastapi import APIRouter, Depends, HTTPException

from ..ai_tools import TOOLS, run_tool
from ..config import settings
from ..deps import CurrentUser, get_current_user
from ..schemas.ai import (
    AskRequest,
    AskResponse,
    ExtractedTask,
    ImportTasksRequest,
    ImportTasksResponse,
    ParseTranscriptRequest,
    ParseTranscriptResponse,
    ToolCallLog,
)
from ..supabase_client import db_get, db_post

router = APIRouter(prefix="/ai", tags=["ai"])

MAX_TOOL_ITERATIONS = 5

CHAT_SYSTEM_PROMPT = """You are the in-app assistant for Mud & Marble OS, a construction-management tool \
for a luxury residential builder. Answer questions about the company's projects, finances, tasks, clients, \
and subcontractors using ONLY the tools provided -- never invent numbers or records. If a search tool \
returns no results, say so plainly rather than guessing. Keep answers concise and grounded in exactly what \
the tools returned.

You can also take action: create_task (this is also how you create calendar/schedule events -- a task with \
scheduled_start/scheduled_end IS a calendar entry), create_client, and add_client_note. Use these whenever \
the user clearly asks you to log, schedule, or record something -- don't just tell them how to do it \
themselves. A request can need more than one tool in sequence (e.g. "note that Abby referred Kathleen and \
have Shannon send a thank-you" is a client note plus a task for Shannon -- do both).

Before creating something, use the matching search tool if you're not confident of the exact project or \
client name, so you don't create a duplicate or attach a task to the wrong job. If a create/note tool \
returns an error (e.g. no match, or more than one match), don't guess -- tell the user what's ambiguous and \
ask them to clarify, or ask before creating a brand-new record for a name that didn't match anything.

After taking an action, confirm plainly what you did (what was created, who it's assigned to, any date) so \
it's easy to double-check. You cannot delete or archive anything, and you should never guess at financial \
figures or invent people/projects that don't show up in a search."""

EXTRACTION_PROMPT = """You are an assistant for Mud & Marble, a luxury residential construction \
company in Indianapolis. Read this meeting transcript and extract ALL action items, tasks, and \
project updates mentioned.

Here are the company's real active projects. When a task or update clearly relates to one of them, \
copy its EXACT name from this list into the "project" field -- do not paraphrase or invent a name. \
If a task is internal/operational and doesn't clearly belong to any listed job, use null.
Active projects:
{project_names}

Return ONLY a JSON object with this structure (no markdown, no explanation):
{{
  "tasks": [
    {{"title": "task description", "assigned_to": "brent|shannon|alex|faith", "project": "exact project name from the list above, or null", "priority": "high|normal"}}
  ],
  "project_updates": [
    {{"project": "exact project name from the list above", "update": "what was discussed"}}
  ]
}}

Transcript:
{transcript}"""


# Sonnet's context window is ~200k tokens -- a real meeting transcript, even a
# long one, is nowhere close to that. This ceiling exists only to guard against
# a truly pathological paste, not to trim normal input (the previous 6000-char
# limit was silently discarding the majority of most real transcripts).
MAX_TRANSCRIPT_CHARS = 150_000


async def _active_project_names() -> list[str]:
    rows = await db_get(
        "projects", "?is_archived=eq.false&status=in.(active,estimating,proposed,pre_construction)&select=name&order=name.asc"
    )
    return [r["name"].split("|")[0].strip() for r in rows]


@router.post("/parse-transcript", response_model=ParseTranscriptResponse)
async def parse_transcript(body: ParseTranscriptRequest, _: CurrentUser = Depends(get_current_user)):
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY is not configured")

    names = await _active_project_names()
    project_names = "\n".join(f"- {n}" for n in names) if names else "(no active projects yet)"

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=8192,
        messages=[
            {
                "role": "user",
                "content": EXTRACTION_PROMPT.format(
                    project_names=project_names, transcript=body.transcript[:MAX_TRANSCRIPT_CHARS]
                ),
            }
        ],
    )

    if message.stop_reason == "max_tokens":
        raise HTTPException(
            status_code=502,
            detail="Claude ran out of room extracting tasks from this transcript -- try a shorter excerpt "
            "(e.g. just the summary, or split the transcript into two passes).",
        )

    raw = message.content[0].text if message.content else "{}"
    raw = raw.replace("```json", "").replace("```", "").strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=502, detail=f"Claude's response couldn't be parsed as JSON -- try again. ({e})"
        ) from e

    return ParseTranscriptResponse(
        tasks=[ExtractedTask(**t) for t in parsed.get("tasks", [])],
        project_updates=parsed.get("project_updates", []),
    )


@router.post("/import-tasks", response_model=ImportTasksResponse)
async def import_tasks(body: ImportTasksRequest, _: CurrentUser = Depends(get_current_user)):
    projects = await db_get(
        "projects", "?is_archived=eq.false&status=in.(active,estimating,proposed,pre_construction)&select=id,name"
    )

    imported = 0
    for task in body.tasks:
        matched = None
        if task.project:
            target = task.project.lower().strip()
            # Exact match first -- the extraction prompt gives Claude the real
            # project names to copy from, so this should be the common case.
            matched = next((p for p in projects if p["name"].split("|")[0].strip().lower() == target), None)
            if not matched:
                # Fallback for anything that didn't come through the extraction
                # step with the real project list (e.g. tasks edited by hand).
                needle = target[:6]
                matched = next((p for p in projects if needle in p["name"].lower()), None)

        await db_post(
            "schedule_items",
            {
                "project_id": matched["id"] if matched else None,
                "title": task.title,
                "assigned_to": task.assigned_to or "shannon",
                "status": "upcoming",
                "notes": "Imported from Fathom transcript",
            },
        )
        imported += 1

    return ImportTasksResponse(imported=imported)


@router.post("/chat", response_model=AskResponse)
async def chat(body: AskRequest, current_user: CurrentUser = Depends(get_current_user)):
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY is not configured")

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    messages: list[dict] = [{"role": m.role, "content": m.content} for m in body.history]
    messages.append({"role": "user", "content": body.message})

    tool_log: list[ToolCallLog] = []
    for _ in range(MAX_TOOL_ITERATIONS):
        response = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=CHAT_SYSTEM_PROMPT,
            tools=TOOLS,
            messages=messages,
        )

        if response.stop_reason != "tool_use":
            reply = "".join(b.text for b in response.content if b.type == "text")
            return AskResponse(reply=reply or "I couldn't find an answer to that.", tool_calls=tool_log)

        messages.append({"role": "assistant", "content": [b.model_dump() for b in response.content]})
        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            result = await run_tool(block.name, block.input, current_user)
            tool_log.append(ToolCallLog(name=block.name, input=block.input))
            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(result, default=str)[:8000],
                }
            )
        messages.append({"role": "user", "content": tool_results})

    return AskResponse(
        reply="That question needed more digging than I could finish -- try narrowing it down.",
        tool_calls=tool_log,
    )
