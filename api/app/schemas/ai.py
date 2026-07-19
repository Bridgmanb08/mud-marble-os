from typing import Optional

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


class ImportTasksRequest(BaseModel):
    tasks: list[ExtractedTask]


class ImportTasksResponse(BaseModel):
    imported: int
