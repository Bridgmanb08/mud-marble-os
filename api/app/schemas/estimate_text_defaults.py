from typing import Optional

from pydantic import BaseModel


class EstimateTextDefaultsUpdate(BaseModel):
    introductory_text: Optional[str] = None
    closing_text: Optional[str] = None


class EstimateTextDefaultsOut(BaseModel):
    id: str
    introductory_text: Optional[str] = None
    closing_text: Optional[str] = None
    updated_at: str
