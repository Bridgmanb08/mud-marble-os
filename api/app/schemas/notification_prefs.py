import re
from typing import Literal, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, field_validator

_TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _check_time(v):
    if v is not None and not _TIME.match(v):
        raise ValueError("Use a 24-hour time like 07:00")
    return v


class NotificationPrefsUpdate(BaseModel):
    email_enabled: Optional[bool] = None
    morning_enabled: Optional[bool] = None
    morning_time: Optional[str] = None
    wrapup_enabled: Optional[bool] = None
    wrapup_time: Optional[str] = None
    timezone: Optional[str] = None

    _times = field_validator("morning_time", "wrapup_time")(_check_time)

    @field_validator("timezone")
    @classmethod
    def _check_tz(cls, v):
        if v is None:
            return v
        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, ValueError, KeyError):
            raise ValueError("Unknown time zone")
        return v


class NotificationPrefsOut(BaseModel):
    email_enabled: bool
    morning_enabled: bool
    morning_time: str
    wrapup_enabled: bool
    wrapup_time: str
    timezone: str
    email: Optional[str] = None
    email_configured: bool


class DigestRequest(BaseModel):
    kind: Literal["morning", "wrapup"]
