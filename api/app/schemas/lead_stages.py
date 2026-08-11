import re
from typing import Optional

from pydantic import BaseModel, field_validator


def _slugify(label: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", label.strip().lower()).strip("_")
    return slug or "stage"


class LeadStageCreate(BaseModel):
    label: str
    key: Optional[str] = None  # auto-slugified from label when omitted
    sort_order: Optional[int] = None
    is_open: bool = True
    is_won: bool = False
    is_lost: bool = False

    @field_validator("label")
    @classmethod
    def _label_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Label is required")
        return v.strip()


class LeadStageUpdate(BaseModel):
    # key is intentionally not editable here -- leads.status already stores
    # this value on existing rows, so renaming the key would silently
    # orphan them. Renaming what's *shown* is done via label.
    label: Optional[str] = None
    sort_order: Optional[int] = None
    is_open: Optional[bool] = None
    is_won: Optional[bool] = None
    is_lost: Optional[bool] = None


class LeadStageOut(BaseModel):
    id: str
    key: str
    label: str
    sort_order: int = 0
    is_open: bool = True
    is_won: bool = False
    is_lost: bool = False
    created_at: str
