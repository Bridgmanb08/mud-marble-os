import json
from datetime import datetime, timezone
from typing import Optional

from anthropic import AsyncAnthropic
from fastapi import APIRouter, Depends, HTTPException

from ..ai_tools import TOOLS, run_tool
from ..config import settings
from ..deps import CurrentUser, get_current_user
from ..schemas.ai import (
    AskRequest,
    AskResponse,
    ExtractedTask,
    FathomImportOut,
    ImportTasksRequest,
    ImportTasksResponse,
    ParseTranscriptRequest,
    ParseTranscriptResponse,
    ToolCallLog,
)
from ..supabase_client import db_get, db_post
from ..team_roster import normalize_assignee_name

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

The input may include both a pre-written meeting summary and the full raw transcript for the same \
meeting (e.g. pasted one after the other). If so, treat them as one combined source describing a single \
meeting -- do not extract the same task or decision twice just because it's mentioned in both the summary \
and the transcript's dialogue. Each distinct action item should appear exactly once in "tasks".
{current_project_context}
Here are the company's real active projects. When a task or update clearly relates to one of them, \
copy its EXACT name from this list into the "project" field -- do not paraphrase or invent a name. \
If a task is internal/operational and doesn't clearly belong to any listed job, use null.
Active projects:
{project_names}

Also look for the meeting's own date/time and who attended -- Fathom transcripts usually state these \
near the top (e.g. a header line or the first few lines of dialogue introducing who's present). If the \
date isn't stated anywhere, use null. If no attendees are named, use an empty list -- never guess or \
invent a name that isn't in the transcript.

Also write a short meeting title (e.g. "Kickoff call with Jon & Erin" or "4409 N Pennsylvania walkthrough" \
-- reference the project or attendees if either is clear, otherwise a plain description of what the \
meeting was about) and a concise 2-4 sentence summary of what was discussed and decided, suitable to log \
as a project note. Use null for either if the transcript is too thin to summarize meaningfully.

Return ONLY a JSON object with this structure (no markdown, no explanation):
{{
  "tasks": [
    {{"title": "task description", "assigned_to": "Brent Bridgman|Shannon Ingram|Alex Peralta|Faith Wyatt", "project": "exact project name from the list above, or null", "priority": "high|normal"}}
  ],
  "project_updates": [
    {{"project": "exact project name from the list above", "update": "what was discussed"}}
  ],
  "meeting_date": "the meeting's date/time exactly as stated in the transcript, or null",
  "attendees": ["name mentioned as present", "..."],
  "meeting_title": "short descriptive title, or null",
  "summary": "2-4 sentence summary of the meeting, or null"
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

    current_project_context = ""
    if body.current_project_name:
        current_project_context = (
            f"\nThis transcript is being imported from the project page for \"{body.current_project_name}\". "
            f"Default every task's \"project\" field to this exact name. Only use a different project name if "
            f"the transcript clearly and explicitly states the MEETING ITSELF is about a different specific "
            f"job -- a passing mention of another address, job, or a subcontractor who also works elsewhere is "
            f"not enough to override this default. If it's unclear, use \"{body.current_project_name}\" rather "
            f"than guessing another job.\n"
        )

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=8192,
        messages=[
            {
                "role": "user",
                "content": EXTRACTION_PROMPT.format(
                    project_names=project_names,
                    current_project_context=current_project_context,
                    transcript=body.transcript[:MAX_TRANSCRIPT_CHARS],
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
        meeting_date=parsed.get("meeting_date") or None,
        attendees=parsed.get("attendees") or [],
        meeting_title=parsed.get("meeting_title") or None,
        summary=parsed.get("summary") or None,
    )


def _import_note(meeting_date: Optional[str], attendees: list[str]) -> str:
    imported_at = datetime.now(timezone.utc).strftime("%b %-d, %Y %-I:%M %p UTC")
    note = f"Imported from Fathom transcript on {imported_at}"
    if meeting_date:
        note += f"\nMeeting date: {meeting_date}"
    if attendees:
        note += f"\nAttendees: {', '.join(attendees)}"
    return note


@router.post("/import-tasks", response_model=ImportTasksResponse)
async def import_tasks(body: ImportTasksRequest, current_user: CurrentUser = Depends(get_current_user)):
    projects = await db_get(
        "projects", "?is_archived=eq.false&status=in.(active,estimating,proposed,pre_construction)&select=id,name"
    )
    notes = _import_note(body.meeting_date, body.attendees)

    # Imported tasks should land at the top of "To Do" (same reasoning as a
    # manually-created task -- see create_task in routers/tasks.py), with the
    # batch keeping its own extraction order above whatever was already there.
    existing_min = await db_get(
        "schedule_items", "?status=eq.upcoming&order=position.asc&limit=1&select=position"
    )
    next_position = (existing_min[0]["position"] - len(body.tasks)) if existing_min else 0

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

        if not matched and body.default_project_id:
            # Imported from a specific job's page -- default there unless the
            # transcript itself named a different project.
            matched = next((p for p in projects if p["id"] == body.default_project_id), None)

        await db_post(
            "schedule_items",
            {
                "project_id": matched["id"] if matched else None,
                "title": task.title,
                "assigned_to": normalize_assignee_name(task.assigned_to) or "Shannon Ingram",
                "status": "upcoming",
                "notes": notes,
                "position": next_position,
            },
        )
        next_position += 1
        imported += 1

    # Best-effort history row so the "Fathom imports" panel can show what was
    # imported, when, and by whom -- never lets a logging failure break the
    # actual import, same convention as _log_message in twilio_sms.py.
    try:
        await db_post(
            "fathom_imports",
            {
                "imported_by": current_user.name,
                "meeting_title": body.meeting_title,
                "summary": body.summary,
                "meeting_date": body.meeting_date,
                "attendees": body.attendees,
                "task_count": imported,
                "project_id": body.default_project_id,
            },
        )
    except Exception:
        pass

    return ImportTasksResponse(imported=imported)


@router.get("/fathom-imports", response_model=list[FathomImportOut])
async def list_fathom_imports(_: CurrentUser = Depends(get_current_user)):
    rows = await db_get(
        "fathom_imports", "?order=imported_at.desc&limit=50&select=*,projects(name)"
    )
    out = []
    for r in rows:
        project = r.pop("projects", None) or {}
        out.append(FathomImportOut(**r, project_name=project.get("name")))
    return out


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
