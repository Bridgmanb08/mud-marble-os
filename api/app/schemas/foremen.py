import re
from typing import Optional

from pydantic import BaseModel, field_validator, model_validator

from ..schema_validators import forbid_null

_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def _check_color(v: Optional[str]) -> Optional[str]:
    if v is not None and not _HEX.match(v):
        raise ValueError("color must look like #RRGGBB")
    return v.lower() if v else v


class ForemanCreate(BaseModel):
    name: str
    color: str = "#7B4B34"

    _color = field_validator("color")(_check_color)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name is required")
        return v


class ForemanUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None

    _color = field_validator("color")(_check_color)

    @model_validator(mode="after")
    def _no_nulls(self):
        forbid_null(self, {"name", "color", "sort_order"})
        return self


class ForemanOut(BaseModel):
    id: str
    name: str
    color: str
    sort_order: int = 0
