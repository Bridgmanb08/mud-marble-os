from pydantic import BaseModel

from ..ai_provider import EstimateSuggestion, GapQuestion


class TranscriptExtractRequest(BaseModel):
    transcript: str


class GapCheckResponse(BaseModel):
    questions: list[GapQuestion]
    dropped: list[str] = []


class TranscriptExtractResponse(BaseModel):
    suggestions: list[EstimateSuggestion]
    dropped: list[str] = []
