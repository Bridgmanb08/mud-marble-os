import re
from typing import Optional

from .supabase_client import db_get, db_post


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
    content_lower = content.lower()
    for u in users:
        name = u.get("name")
        if not name or u["id"] == exclude_user_id:
            continue
        # A real word-boundary check, not a raw substring test -- "@jon" is
        # itself a substring of "@jonathan", so a plain `in` check cross-
        # notified a shorter-named person (Jon, Sam, Ann, Will...) any time
        # someone typed the full "@Jonathan"/"@Samuel"/etc. MentionTextarea
        # always inserts the full picked name followed by a space, so the
        # character right after a genuine mention is never itself a letter
        # or digit -- reject the match if it is.
        if re.search(rf"@{re.escape(name.lower())}(?![a-z0-9])", content_lower):
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
