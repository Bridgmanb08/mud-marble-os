from typing import Optional

from pydantic import BaseModel, model_validator

from ..schema_validators import forbid_null


class ProjectBrief(BaseModel):
    name: str


class CalendarEventCreate(BaseModel):
    project_id: Optional[str] = None
    title: str
    notes: Optional[str] = None
    event_date: str


class CalendarEventUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    event_date: Optional[str] = None

    @model_validator(mode="after")
    def _validate_no_null_required(self):
        forbid_null(self, {"title", "event_date"})
        return self


class CalendarEventOut(BaseModel):
    id: str
    project_id: Optional[str] = None
    title: str
    notes: Optional[str] = None
    event_date: str
    # None for a genuine manual event; set only on the auto-synced project
    # start/completion/phase-date rows below. Read-only -- never accepted on
    # create or update, so a client can never fake or clear one.
    auto_kind: Optional[str] = None
    created_at: str
    projects: Optional[ProjectBrief] = None
