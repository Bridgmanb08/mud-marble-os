from typing import Optional

from pydantic import BaseModel, Field


class PulseCheckinCreate(BaseModel):
    workload_rating: int = Field(ge=1, le=5)
    feeling_stuck: bool = False
    stuck_note: Optional[str] = None
    grateful_for: Optional[str] = None
    win: Optional[str] = None


class PulseCheckinOut(BaseModel):
    id: str
    user_id: str
    workload_rating: int
    feeling_stuck: bool
    stuck_note: Optional[str] = None
    grateful_for: Optional[str] = None
    win: Optional[str] = None
    created_at: str


class PulseMemberSummary(BaseModel):
    user_id: str
    name: str
    latest: Optional[PulseCheckinOut] = None
    days_since_checkin: Optional[int] = None
    trend: list[int] = []


class PulseWinEntry(BaseModel):
    user_id: str
    name: str
    grateful_for: Optional[str] = None
    win: Optional[str] = None
    created_at: str


class PulseTeamSummary(BaseModel):
    members: list[PulseMemberSummary]
    avg_workload: Optional[float] = None
    stuck_count: int
    responses_this_week: int
    recent_wins: list[PulseWinEntry] = []


class PulsePushResponse(BaseModel):
    sent: int
