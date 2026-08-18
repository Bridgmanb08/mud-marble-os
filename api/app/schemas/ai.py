from typing import Literal, Optional

from pydantic import BaseModel


class ParseTranscriptRequest(BaseModel):
    transcript: str
    current_project_name: Optional[str] = None


class ExtractedTask(BaseModel):
    title: str
    assigned_to: Optional[str] = None
    project: Optional[str] = None
    priority: Optional[str] = None


class ExtractedProjectUpdate(BaseModel):
    project: Optional[str] = None
    update: str


class ParseTranscriptResponse(BaseModel):
    tasks: list[ExtractedTask]
    project_updates: list[ExtractedProjectUpdate]
    meeting_date: Optional[str] = None
    attendees: list[str] = []
    meeting_title: Optional[str] = None
    summary: Optional[str] = None


class ImportTasksRequest(BaseModel):
    tasks: list[ExtractedTask]
    meeting_date: Optional[str] = None
    attendees: list[str] = []
    default_project_id: Optional[str] = None
    meeting_title: Optional[str] = None
    summary: Optional[str] = None


class ImportTasksResponse(BaseModel):
    imported: int


class FathomImportOut(BaseModel):
    id: str
    imported_at: str
    imported_by: Optional[str] = None
    meeting_title: Optional[str] = None
    summary: Optional[str] = None
    meeting_date: Optional[str] = None
    attendees: list[str] = []
    task_count: int = 0
    project_id: Optional[str] = None
    project_name: Optional[str] = None


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AskRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


class ToolCallLog(BaseModel):
    name: str
    input: dict


class AskResponse(BaseModel):
    reply: str
    tool_calls: list[ToolCallLog] = []
