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
        if f"@{name.lower()}" in content_lower:
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
