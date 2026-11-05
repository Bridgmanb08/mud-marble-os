from typing import Any, Optional

from pydantic import BaseModel


class ActivityEntry(BaseModel):
    id: str
    table_name: str
    record_id: str
    field: str
    old_value: Any = None
    new_value: Any = None
    actor_name: Optional[str] = None
    # human, bot, or legacy. legacy is "we don't know" — never displayed as a bot.
    actor_type: str
    source: Optional[str] = None
    action: str = "update"
    project_id: Optional[str] = None
    created_at: str
    record_title: Optional[str] = None
