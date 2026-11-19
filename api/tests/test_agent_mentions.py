"""AI bot @-mentions: directory, matching, durable rows, and the webhook."""

import asyncio
from pathlib import Path

from fastapi.testclient import TestClient

from app.agent_bots import (
    AGENT_BOTS,
    AgentMentionContext,
    build_mention_directory,
    build_webhook_payload,
    deliver_webhook,
    mentioned_bot_names,
    record_agent_mentions,
)
from app.config import settings
from app.main import app
from app.mentions import create_mention_notifications, name_is_mentioned
from app.security import create_access_token


def _run(coro):
    return asyncio.run(coro)


def test_mention_boundary_matches_the_human_rule():
    assert name_is_mentioned("@Jonathan please", "Jon") is False
    assert name_is_mentioned("@Mike Rossi can you", "Mike Ross") is False
    assert name_is_mentioned("ping @Mike", "Mike Ross") is False
    assert name_is_mentioned("@Mike Ross, the schedule slipped", "Mike Ross") is True
    assert name_is_mentioned("@mike ross tomorrow", "Mike Ross") is True


def test_mentioned_bots_are_canonical_names_only():
    text = "@Mike Ross and @Rachel Zane — also @Shannon Ingram, not @Mike"
    assert mentioned_bot_names(text) == ["Mike Ross", "Rachel Zane"]
    assert mentioned_bot_names("no mentions") == []
    assert {bot.name for bot in AGENT_BOTS} == {
        "Donna Paulsen",
        "Mike Ross",
        "Rachel Zane",
        "Jessica Pearson",
        "Louis Litt",
    }


def test_migration_names_match_the_bot_list():
    sql = Path(__file__).resolve().parents[2].joinpath("supabase/migrations/0091_agent_mentions.sql").read_text()
    for bot in AGENT_BOTS:
        assert f"'{bot.name}'" in sql
    assert "enable row level security" in sql
    assert "revoke all on table agent_mentions from public, anon, authenticated" in sql
    assert "grant all on table agent_mentions to service_role" in sql


def test_mention_directory_adds_bots_without_removing_people():
    humans = [
        {"id": "u-brent", "name": "Brent Bridgman"},
        {"id": "u-erinn", "name": "Erinn Bridgman"},
        {"id": "u-manuel", "name": "Manuel Alvarado"},
        {"id": "u-megan", "name": "Megan Martens"},
        {"id": "u-shannon", "name": "Shannon Ingram"},
    ]
    entries = build_mention_directory(humans)
    by_name = {entry["name"]: entry for entry in entries}
    for human in humans:
        assert by_name[human["name"]]["is_bot"] is False
        assert by_name[human["name"]]["id"] == human["id"]
    # Roster names with no login stay mentionable, and they are not bots.
    assert by_name["Faith Wyatt"]["is_bot"] is False
    mike = by_name["Mike Ross"]
    assert mike["is_bot"] is True
    assert mike["id"] == "bot:mike-ross"
    assert mike["bot_role"] == "tasks / schedule"
    assert {bot.name for bot in AGENT_BOTS} <= set(by_name)


def test_directories_keep_bots_out_of_the_assignee_list(monkeypatch):
    async def fake_get(table, query=""):
        assert table == "app_users"
        return [
            {"id": "u-brent", "name": "Brent Bridgman"},
            {"id": "u-shannon", "name": "Shannon Ingram"},
        ]

    monkeypatch.setattr("app.routers.users.db_get", fake_get)
    client = TestClient(app)
    token = create_access_token("u-brent", "brent@mudmarble.com", "Brent Bridgman", "owner", True)
    client.cookies.set("session", token)

    assignees = client.get("/api/users/directory")
    assert assignees.status_code == 200
    assignee_names = {row["name"] for row in assignees.json()}
    assert "Mike Ross" not in assignee_names
    assert "Donna Paulsen" not in assignee_names
    assert "Brent Bridgman" in assignee_names
    assert all("is_bot" not in row for row in assignees.json())

    mentions = client.get("/api/users/mention-directory")
    assert mentions.status_code == 200
    bots = [row for row in mentions.json() if row["is_bot"]]
    assert {row["name"] for row in bots} == {bot.name for bot in AGENT_BOTS}
    assert client.get("/api/users/mention-directory").status_code == 200

    anonymous = TestClient(app)
    assert anonymous.get("/api/users/mention-directory").status_code == 401


def test_human_notifications_ignore_bot_names(monkeypatch):
    posts = []

    async def fake_get(table, query=""):
        assert table == "app_users"
        return [
            {"id": "u-shannon", "name": "Shannon Ingram"},
            {"id": "u-brent", "name": "Brent Bridgman"},
        ]

    async def fake_post(table, data):
        posts.append((table, data))
        return [data]

    monkeypatch.setattr("app.mentions.db_get", fake_get)
    monkeypatch.setattr("app.mentions.db_post", fake_post)
    _run(
        create_mention_notifications(
            "@Mike Ross please, and @Shannon Ingram too",
            "proj-1",
            "task_comment",
            "comment-1",
            "mentioned you",
            exclude_user_id="u-brent",
        )
    )
    assert posts == [
        (
            "notifications",
            {
                "user_id": "u-shannon",
                "type": "mention",
                "source_type": "task_comment",
                "source_id": "comment-1",
                "project_id": "proj-1",
                "message": "mentioned you",
            },
        )
    ]


def _context(text: str) -> AgentMentionContext:
    return AgentMentionContext(
        comment_id="comment-1",
        source_type="task_comment",
        author="Brent Bridgman",
        author_id="u-brent",
        text=text,
        created_at="2026-11-19T16:00:00+00:00",
        link_path="/tasks?task=task-1",
        task_id="task-1",
        task_name="Order cabinets",
        project_id="proj-1",
    )


def test_record_writes_one_row_per_bot_and_one_webhook(monkeypatch):
    saved = {}

    async def fake_get(table, query=""):
        assert table == "projects"
        return [{"name": "Kitchen Remodel | Smith"}]

    async def fake_post_many(table, data):
        saved["table"] = table
        saved["data"] = data
        return [{"id": f"row-{i}", "created_at": data[i]["created_at"]} for i in range(len(data))]

    class Queue:
        def __init__(self):
            self.tasks = []

        def add_task(self, func, *args, **kwargs):
            self.tasks.append((func, args, kwargs))

    monkeypatch.setattr("app.agent_bots.db_get", fake_get)
    monkeypatch.setattr("app.agent_bots.db_post_many", fake_post_many)
    monkeypatch.setattr(settings, "public_base_url", "https://os.example")
    queue = Queue()
    _run(record_agent_mentions(_context("@Rachel Zane check the numbers, @Mike Ross the date"), queue))

    assert saved["table"] == "agent_mentions"
    assert [row["bot"] for row in saved["data"]] == ["Mike Ross", "Rachel Zane"]
    row = saved["data"][0]
    assert row["author"] == "Brent Bridgman"
    assert row["comment_text"].startswith("@Rachel Zane")
    assert row["task_id"] == "task-1"
    assert row["task_name"] == "Order cabinets"
    assert row["project_name"] == "Kitchen Remodel"
    assert row["job_id"] == "proj-1"
    assert row["job_name"] == "Kitchen Remodel"
    assert row["link"] == "https://os.example/tasks?task=task-1"
    assert row["source_type"] == "task_comment"
    assert len(queue.tasks) == 1
    payload = queue.tasks[0][1][0]
    assert payload["mentioned_bots"] == ["Mike Ross", "Rachel Zane"]
    assert payload["author"] == "Brent Bridgman"
    assert payload["task"] == {"id": "task-1", "name": "Order cabinets"}
    assert payload["job"] == {"id": "proj-1", "name": "Kitchen Remodel"}
    assert payload["project"] == {"id": "proj-1", "name": "Kitchen Remodel"}
    assert payload["link"] == "https://os.example/tasks?task=task-1"
    assert payload["created_at"] == "2026-11-19T16:00:00+00:00"
    assert "MMOS" not in str(payload)


def test_plain_comment_does_not_write_a_bot_row(monkeypatch):
    async def fake_post_many(table, data):
        raise AssertionError("no bot was mentioned")

    monkeypatch.setattr("app.agent_bots.db_post_many", fake_post_many)

    class Queue:
        def __init__(self):
            self.tasks = []

        def add_task(self, func, *args, **kwargs):
            self.tasks.append((func, args))

    queue = Queue()
    _run(record_agent_mentions(_context("thanks @Shannon Ingram"), queue))
    assert queue.tasks == []


def test_record_keeps_the_comment_when_the_table_is_missing(monkeypatch):
    async def fake_get(table, query=""):
        return []

    async def fake_post_many(table, data):
        raise RuntimeError('relation "agent_mentions" does not exist')

    monkeypatch.setattr("app.agent_bots.db_get", fake_get)
    monkeypatch.setattr("app.agent_bots.db_post_many", fake_post_many)
    _run(record_agent_mentions(_context("@Donna Paulsen route this")))


def test_webhook_skipped_when_env_is_unset(monkeypatch):
    calls = {"post": 0, "patch": 0}

    async def fake_post(url, auth, payload):
        calls["post"] += 1
        return True, ""

    async def fake_patch(table, query, data):
        calls["patch"] += 1
        return []

    monkeypatch.setattr(settings, "mmos_agent_webhook_url", "")
    monkeypatch.setattr(settings, "mmos_agent_webhook_auth", "")
    monkeypatch.setattr("app.agent_bots._post_webhook", fake_post)
    monkeypatch.setattr("app.agent_bots.db_patch_query", fake_patch)
    _run(deliver_webhook({"comment_id": "comment-1"}, ["row-1"]))
    assert calls == {"post": 0, "patch": 0}


def test_webhook_sends_the_auth_header_verbatim_and_marks_delivered(monkeypatch):
    seen = {}
    patches = []

    async def fake_post(url, auth, payload):
        seen["url"] = url
        seen["auth"] = auth
        seen["payload"] = payload
        return True, ""

    async def fake_patch(table, query, data):
        patches.append((table, query, data))
        return []

    monkeypatch.setattr(settings, "mmos_agent_webhook_url", "https://hooks.example/mmos")
    monkeypatch.setattr(settings, "mmos_agent_webhook_auth", "Token abc123")
    monkeypatch.setattr("app.agent_bots._post_webhook", fake_post)
    monkeypatch.setattr("app.agent_bots.db_patch_query", fake_patch)
    payload = build_webhook_payload(_context("@Mike Ross"), ["Mike Ross"], "https://os.example/tasks?task=task-1", "2026-11-19T16:00:00+00:00")
    _run(deliver_webhook(payload, ["row-1", "row-2"]))
    assert seen["url"] == "https://hooks.example/mmos"
    assert seen["auth"] == "Token abc123"
    assert seen["payload"]["mentioned_bots"] == ["Mike Ross"]
    assert patches[0][0] == "agent_mentions"
    assert patches[0][1] == "?id=in.(row-1,row-2)"
    assert patches[0][2]["delivered"] is True
    assert patches[0][2]["delivery_attempts"] == 1
    assert "acked" not in patches[0][2]


def test_webhook_retries_then_records_the_failure(monkeypatch):
    attempts = {"n": 0}
    pauses = []
    patches = []

    async def fake_post(url, auth, payload):
        attempts["n"] += 1
        if attempts["n"] < 3:
            return False, "HTTP 502"
        return True, ""

    async def fake_pause(seconds):
        pauses.append(seconds)

    async def fake_patch(table, query, data):
        patches.append(data)
        return []

    monkeypatch.setattr(settings, "mmos_agent_webhook_url", "https://hooks.example/mmos")
    monkeypatch.setattr(settings, "mmos_agent_webhook_auth", "secret")
    monkeypatch.setattr("app.agent_bots._post_webhook", fake_post)
    monkeypatch.setattr("app.agent_bots._pause", fake_pause)
    monkeypatch.setattr("app.agent_bots.db_patch_query", fake_patch)
    _run(deliver_webhook({"comment_id": "comment-1", "mentioned_bots": ["Louis Litt"]}, ["row-1"]))
    assert attempts["n"] == 3
    assert pauses == [0.25, 0.5]
    assert patches[-1]["delivered"] is True
    assert patches[-1]["delivery_attempts"] == 3

    attempts["n"] = 0

    async def always_fail(url, auth, payload):
        attempts["n"] += 1
        return False, "HTTP 500"

    monkeypatch.setattr("app.agent_bots._post_webhook", always_fail)
    _run(deliver_webhook({"comment_id": "comment-1"}, ["row-9"]))
    assert attempts["n"] == 3
    assert patches[-1]["delivered"] is False
    assert patches[-1]["delivery_attempts"] == 3
    assert patches[-1]["last_delivery_error"] == "HTTP 500"
