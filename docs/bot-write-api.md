# Bot write API

Brent's assistants (Mike Ross, Louis Litt, Rachel Zane, Jessica Pearson, Donna Paulsen) should create and update tasks, project schedule dates, and calendar events through this API instead of writing to Supabase directly.

Direct inserts skip two things the app does on every save:

- assignment notifications and `@mention` pings
- the change history that shows a robot badge and who changed what

Reads can stay on Supabase. Writes that should show up in Mud & Marble OS go through `/api/bot`.

Money is not on this API. A bot cannot change invoices, estimates, change orders, draws, contract values, balances, or payments. Those still need Brent.

## 1. Run the migration

In the Supabase SQL editor for project `boekqzxgooinrhxlckbp`, run the full script in `supabase/migrations/0084_bot_activity_trail.sql`. Nothing in this repo applies it for you.

Until that script has been run, the app keeps working. New actor columns are written best-effort, and a task with no actor shows as unknown/legacy, not as a bot. History and bot badges fill in after the script.

## 2. Give each bot a credential

Generate a token on your own machine. Do not commit it, and do not paste it into the repo.

```bash
python3 -c "import secrets,hashlib; t=secrets.token_urlsafe(32); print('token:', t); print('sha256:', hashlib.sha256(t.encode()).hexdigest())"
```

Put the plaintext token in that bot's secret store. Store only the hash in Supabase:

```sql
insert into bot_credentials (name, token_sha256)
values ('Mike Ross', '<sha256 hex from the command above>');
```

Use the display name you want on the badge: `Mike Ross`, `Louis Litt`, `Rachel Zane`, `Jessica Pearson`, `Donna Paulsen`. The name on the row is what the app shows.

To rotate, insert a new row and revoke the old one:

```sql
update bot_credentials
set revoked_at = now()
where name = 'Mike Ross' and revoked_at is null and token_sha256 = '<old sha256>';
```

### Optional: environment variable instead of a table row

On Vercel → Project → Settings → Environment Variables, set `BOT_API_KEYS` (a secret) and redeploy:

```text
{"Mike Ross":"<token>","Louis Litt":"<token>"}
```

Or one pair per line, or pairs separated by `;;`:

```text
Mike Ross=<token>;;Louis Litt=<token>
```

Either a table row or this variable is enough. If both are set, a token from either one is accepted. Prefer the table so adding a bot does not need a redeploy.

## 3. Call the API

Base URL is the deployed app, for example `https://<your-vercel-host>`. Send `Authorization: Bearer <token>` and `Content-Type: application/json`.

`source` is optional on every call. Put the meeting name and date there so the history can say where the change came from.

### Create a task (including a nudge for Shannon)

`POST /api/bot/tasks`

```json
{
  "title": "Confirm cabinet delivery",
  "project_id": "<project uuid>",
  "assignees": ["Shannon"],
  "status": "upcoming",
  "construction_phase": "Cabinets",
  "scheduled_end": "2026-11-06",
  "source": "Weekly ops — 2026-10-27"
}
```

Shannon gets the same in-app "new assignment" notification she would get if Brent assigned it in the app. The card shows a robot badge with the bot's name.

### Update a task

`PATCH /api/bot/tasks/<task uuid>`

```json
{
  "scheduled_start": "2026-11-03",
  "scheduled_end": "2026-11-06",
  "phase": "12.15 - Cabinets Install Labor",
  "construction_phase": "Cabinets",
  "status": "in_progress",
  "source": "Site walk with the framer — 2026-10-27"
}
```

Send only the fields that changed. `expected_version` is optional and works the same way as the app (409 if someone else saved first).

### Comment, including an @mention

`POST /api/bot/tasks/<task uuid>/comments`

```json
{
  "content": "@Shannon the inspector moved to Thursday.",
  "source": "Inspector call — 2026-10-27"
}
```

`@Shannon` pings her. The comment is stored as `Mike Ross (AI bot)` so the thread is obviously a bot even before you open change history. A comment does not by itself mark the task as last-edited by the bot. Changing a field does.

### Project schedule fields

`PATCH /api/bot/projects/<project uuid>`

Allowed fields: `start_date`, `estimated_completion`, `current_phase`.

```json
{
  "start_date": "2026-11-03",
  "estimated_completion": "2027-02-12",
  "current_phase": "Framing",
  "source": "Kickoff — 2026-10-27"
}
```

Changing a start or completion date also moves that project's calendar marker, the same way the project page does.

Anything else on a project is refused. `contract_value`, balances, and any invoice, estimate, change order, draw, or payment field return **403** and nothing is saved.

### Calendar events

`POST /api/bot/calendar-events`

```json
{
  "project_id": "<project uuid>",
  "title": "Client walkthrough",
  "event_date": "2026-11-12",
  "notes": "After lunch",
  "source": "Weekly ops — 2026-10-27"
}
```

`PATCH /api/bot/calendar-events/<event uuid>` accepts `title`, `notes`, and `event_date`.

Do not send `auto_kind`. Those rows are the project's own start, completion, and phase markers. Change the project date (or the phase date in the app) instead of editing the marker.

## What you see in the app

- A task or calendar event a bot created or last edited shows a purple robot badge with the bot's name on the task board, schedule, and task drawer.
- A person editing it afterward replaces the badge with "Last edited by Shannon" (or Brent). The history still shows the bot's earlier change.
- Rows from before this feature, and anything still written straight to Supabase, have no actor. They show as unknown/legacy, not as a bot.
- Change history on a task and on a project's overview lists the actor, human vs bot, old value → new value, the meeting source when one was sent, and the time.

## Errors

| Status | Meaning |
|---|---|
| 401 | Token missing or not recognized |
| 403 | The body includes a money field. Fix the payload. Do not retry it. |
| 400 | A field bots are not allowed to set, a bad id, or a bad date order |
| 409 | `expected_version` is stale. Re-read the task and try again |
| 503 | No credentials are configured yet (migration not applied, and `BOT_API_KEYS` is unset) |
