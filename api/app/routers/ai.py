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
and subcontractors using ONLY the search tools provided -- never invent numbers or records. If a tool \
returns no results, say so plainly rather than guessing. Keep answers concise and grounded in exactly what \
the tools returned. You have read-only access -- you cannot create, edit, or delete anything."""

EXTRACTION_PROMPT = """You are an assistant for Mud & Marble, a luxury residential construction \
company in Indianapolis. Read this meeting transcript and extract ALL action items, tasks, and \
project updates mentioned.

Return ONLY a JSON object with this structure (no markdown, no explanation):
{{
  "tasks": [
    {{"title": "task description", "assigned_to": "brent|shannon|alex|faith", "project": "project name or null", "priority": "high|normal"}}
  ],
  "project_updates": [
    {{"project": "project name", "update": "what was discussed"}}
  ]
}}

Transcript:
{transcript}"""


@router.post("/parse-transcript", response_model=ParseTranscriptResponse)
async def parse_transcript(body: ParseTranscriptRequest, _: CurrentUser = Depends(get_current_user)):
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY is not configured")

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1000,
        messages=[{"role": "user", "content": EXTRACTION_PROMPT.format(transcript=body.transcript[:6000])}],
    )
    raw = message.content[0].text if message.content else "{}"
    raw = raw.replace("```json", "").replace("```", "").strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = {"tasks": [], "project_updates": []}

    return ParseTranscriptResponse(
        tasks=[ExtractedTask(**t) for t in parsed.get("tasks", [])],
        project_updates=parsed.get("project_updates", []),
    )


@router.post("/import-tasks", response_model=ImportTasksResponse)
async def import_tasks(body: ImportTasksRequest, _: CurrentUser = Depends(get_current_user)):
    projects = await db_get(
        "projects", "?is_archived=eq.false&status=in.(active,estimating,proposed)&select=id,name"
    )

    imported = 0
    for task in body.tasks:
        matched = None
        if task.project:
            needle = task.project.lower()[:6]
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
