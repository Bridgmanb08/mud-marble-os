from pydantic import BaseModel

from ..ai_provider import EstimateSuggestion


class TranscriptExtractRequest(BaseModel):
    transcript: str


class GapCheckResponse(BaseModel):
    suggestions: list[EstimateSuggestion]
    dropped: list[str] = []


class TranscriptExtractResponse(BaseModel):
    suggestions: list[EstimateSuggestion]
    dropped: list[str] = []
