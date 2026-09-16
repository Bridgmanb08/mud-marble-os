from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class QuoteCreate(BaseModel):
    text: str
    author: Optional[str] = None
    source: Optional[str] = None


class QuoteUpdate(BaseModel):
    text: Optional[str] = None
    author: Optional[str] = None
    source: Optional[str] = None


class QuoteOut(QuoteCreate):
    id: str
    created_at: datetime
