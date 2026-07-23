from typing import Literal, Optional

from pydantic import BaseModel


class ParseTranscriptRequest(BaseModel):
    transcript: str


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


class ImportTasksRequest(BaseModel):
    tasks: list[ExtractedTask]
    meeting_date: Optional[str] = None
    attendees: list[str] = []


class ImportTasksResponse(BaseModel):
    imported: int


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
