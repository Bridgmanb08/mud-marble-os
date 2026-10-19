from typing import Optional

from pydantic import BaseModel, Field


class TranscriptSegment(BaseModel):
    start: float
    text: str


class TranscribeResponse(BaseModel):
    text: str
    segments: list[TranscriptSegment]


class WalkClip(BaseModel):
    label: str  # "Video 1" -- how the transcript and frames refer to a clip
    transcript: str = ""  # "[0:30] words..." lines, or plain pasted text


class WalkFrame(BaseModel):
    clip: str  # matches WalkClip.label
    t: float = 0  # seconds into that clip
    data: str  # base64 JPEG, no data: prefix


class SiteWalkDraftRequest(BaseModel):
    clips: list[WalkClip] = Field(default_factory=list)
    frames: list[WalkFrame] = Field(default_factory=list)
    notes: Optional[str] = None  # anything typed in beyond the videos


class DraftItem(BaseModel):
    title: str
    group_name: Optional[str] = None
    cost_code_id: Optional[str] = None
    quantity: float = 1
    unit: Optional[str] = None
    description: Optional[str] = None
    internal_notes: Optional[str] = None
    # stated = said out loud; inferred = worked out from what was said;
    # visual = only seen in the footage, never mentioned.
    basis: str = "stated"
    is_allowance: bool = False
    source: Optional[str] = None


class SiteWalkDraftResponse(BaseModel):
    summary: str = ""
    items: list[DraftItem]
    questions: list[str] = Field(default_factory=list)
    model: Optional[str] = None


class SiteWalkApplyRequest(BaseModel):
    items: list[DraftItem]


class SiteWalkApplyResponse(BaseModel):
    added_count: int
    errors: list[str] = Field(default_factory=list)
