"""Pure checks for the bot activity trail. No database."""
import unittest
from types import SimpleNamespace

from fastapi import HTTPException

from app.activity import (
    Actor,
    bot_name_for_token,
    classify_actor,
    fields_for_create,
    money_fields,
    parse_bot_api_keys,
    pop_source,
    reject_money_keys,
)
from app.change_log import build_change_rows, diff_fields


class ClassifyTests(unittest.TestCase):
    def test_missing_actor_is_legacy_not_bot(self):
        self.assertEqual(classify_actor({}), ("legacy", None))
        self.assertEqual(classify_actor({"changed_by_name": "Mike Ross"}), ("legacy", "Mike Ross"))

    def test_user_id_without_type_is_human(self):
        kind, name = classify_actor({"changed_by": "user-1", "changed_by_name": "Shannon"})
        self.assertEqual((kind, name), ("human", "Shannon"))

    def test_explicit_bot(self):
        self.assertEqual(classify_actor({"actor_type": "bot", "changed_by_name": "Donna Paulsen"}), ("bot", "Donna Paulsen"))


class MoneyTests(unittest.TestCase):
    def test_schedule_fields_are_not_money(self):
        self.assertEqual(
            money_fields(["start_date", "estimated_completion", "current_phase", "scheduled_end", "status", "title"]),
            [],
        )

    def test_money_names_are_blocked(self):
        blocked = money_fields(["contract_value", "checking_balance", "amount_paid", "invoice_id", "notes"])
        self.assertEqual(blocked, ["contract_value", "checking_balance", "amount_paid", "invoice_id"])

    def test_reject_raises(self):
        with self.assertRaises(HTTPException) as caught:
            reject_money_keys(["contract_value"])
        self.assertEqual(caught.exception.status_code, 403)
        self.assertIn("Brent", caught.exception.detail)


class CredentialParseTests(unittest.TestCase):
    def test_json_and_lines(self):
        self.assertEqual(parse_bot_api_keys('{"Mike Ross":"abc","Louis Litt":"def"}'), [("Mike Ross", "abc"), ("Louis Litt", "def")])
        self.assertEqual(parse_bot_api_keys("Rachel Zane=tok1;;Jessica Pearson=tok2"), [("Rachel Zane", "tok1"), ("Jessica Pearson", "tok2")])

    def test_bad_json_is_empty(self):
        self.assertEqual(parse_bot_api_keys("{not json"), [])

    def test_token_match_is_exact(self):
        pairs = [("Mike Ross", "secret-token")]
        self.assertEqual(bot_name_for_token("secret-token", pairs), "Mike Ross")
        self.assertIsNone(bot_name_for_token("secret-token-x", pairs))
        self.assertIsNone(bot_name_for_token("secret", pairs))


class HistoryRowTests(unittest.TestCase):
    def test_create_fields_skip_noise(self):
        fields = fields_for_create(
            {
                "title": "Call Shannon",
                "status": "upcoming",
                "position": 3,
                "is_milestone": False,
                "assignees": [],
                "scheduled_end": "2026-11-02",
                "notes": "",
            }
        )
        self.assertEqual(set(fields), {"title", "status", "scheduled_end"})

    def test_unchanged_value_is_not_a_diff(self):
        self.assertEqual(diff_fields({"status": "upcoming"}, {"status": "upcoming"}), [])

    def test_bot_row_has_type_source_and_no_user_id(self):
        bot = Actor(name="Mike Ross", actor_type="bot", source="Ops huddle 2026-10-27")
        rows = build_change_rows(
            "schedule_items",
            "11111111-1111-1111-1111-111111111111",
            {"scheduled_end": "2026-10-01"},
            {"scheduled_end": "2026-11-02"},
            bot,
            action="update",
            project_id="22222222-2222-2222-2222-222222222222",
        )
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["actor_type"], "bot")
        self.assertEqual(row["changed_by_name"], "Mike Ross")
        self.assertNotIn("changed_by", row)
        self.assertEqual(row["source"], "Ops huddle 2026-10-27")
        self.assertEqual(row["old_value"], "2026-10-01")
        self.assertEqual(row["new_value"], "2026-11-02")
        self.assertEqual(row["project_id"], "22222222-2222-2222-2222-222222222222")

    def test_human_row_keeps_the_user_id(self):
        user = SimpleNamespace(id="user-1", name="Shannon", email="shannon@example.com")
        rows = build_change_rows("projects", "p1", {"start_date": None}, {"start_date": "2026-11-01"}, user)
        self.assertEqual(rows[0]["actor_type"], "human")
        self.assertEqual(rows[0]["changed_by"], "user-1")
        self.assertEqual(rows[0]["changed_by_name"], "Shannon")
        self.assertEqual(rows[0]["project_id"], "p1")

    def test_source_must_be_a_string(self):
        with self.assertRaises(HTTPException):
            pop_source({"source": 12})


class BotRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from fastapi.testclient import TestClient

        from app.config import settings
        from app.main import app

        settings.bot_api_keys = '{"Mike Ross":"test-token-value"}'
        cls.client = TestClient(app)
        cls.auth = {"Authorization": "Bearer test-token-value"}

    def test_money_on_a_task_is_refused(self):
        res = self.client.post(
            "/api/bot/tasks",
            headers=self.auth,
            json={"title": "Call Shannon", "contract_value": 1200},
        )
        self.assertEqual(res.status_code, 403)
        self.assertIn("money", res.json()["detail"].lower())

    def test_unknown_task_field_is_rejected(self):
        res = self.client.post(
            "/api/bot/tasks",
            headers=self.auth,
            json={"title": "Call Shannon", "not_a_field": True},
        )
        self.assertEqual(res.status_code, 422)

    def test_project_money_and_non_schedule_fields(self):
        project_id = "11111111-1111-1111-1111-111111111111"
        money = self.client.patch(
            f"/api/bot/projects/{project_id}",
            headers=self.auth,
            json={"estimated_completion": "2026-12-01", "contract_value": 5},
        )
        self.assertEqual(money.status_code, 403)
        other = self.client.patch(
            f"/api/bot/projects/{project_id}",
            headers=self.auth,
            json={"name": "Renamed by a bot"},
        )
        self.assertEqual(other.status_code, 400)
        self.assertIn("start_date", other.json()["detail"])

    def test_bad_id_does_not_reach_the_database(self):
        res = self.client.patch("/api/bot/tasks/not-a-uuid", headers=self.auth, json={"status": "upcoming"})
        self.assertEqual(res.status_code, 400)


if __name__ == "__main__":
    unittest.main()
