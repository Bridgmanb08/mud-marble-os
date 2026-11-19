import re
from typing import Optional

from .supabase_client import db_get, db_post


def name_is_mentioned(content: str, name: str) -> bool:
    """True when `content` contains `@name` as its own mention.

    A raw substring check cross-notified shorter names: "@jon" is inside
    "@jonathan". MentionTextarea inserts the picked full name followed by a
    space, so the character right after a genuine mention is never a letter
    or digit. Shared with the AI-bot scan so the two paths can't drift.
    """
    if not content or not name:
        return False
    return re.search(rf"@{re.escape(name.lower())}(?![a-z0-9])", content.lower()) is not None


async def create_mention_notifications(
    content: str,
    project_id: Optional[str],
    source_type: str,
    source_id: str,
    message: str,
    exclude_user_id: str,
) -> None:
    """Scans content for `@Full Name` tokens matching app_users and creates a notification per match."""
    users = await db_get("app_users", "?select=id,name")
    for u in users:
        name = u.get("name")
        if not name or u["id"] == exclude_user_id:
            continue
        if name_is_mentioned(content, name):
            await db_post(
                "notifications",
                {
                    "user_id": u["id"],
                    "type": "mention",
                    "source_type": source_type,
                    "source_id": source_id,
                    "project_id": project_id,
                    "message": message,
                },
            )
