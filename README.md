# Mud & Marble OS

Lead / project management system for Mud & Marble. React + Vite frontend, FastAPI backend,
Supabase (Postgres via REST) for storage, deployed as a single Vercel project.

## Architecture

- `frontend/` — React + TypeScript SPA (Vite). Talks only to `/api/*`, never to Supabase directly.
- `api/` — FastAPI app, deployed as a Vercel Python serverless function (`api/index.py`). Holds the
  Supabase **service-role** key and issues its own login sessions (JWT in an httpOnly cookie) — the
  browser never sees Supabase or Anthropic credentials.
- `supabase/migrations/` — SQL to run by hand in the Supabase SQL editor (this repo has no DB
  credentials, so nothing here runs automatically).
- `scripts/create_user.py` — creates a login account without ever sending the password to anyone
  else; run it yourself.

## Required environment variables (set in Vercel → Project → Settings → Environment Variables)

| Variable | Used by | Notes |
|---|---|---|
| `SUPABASE_URL` | api | e.g. `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | api | **secret** — service_role key, not the anon key |
| `JWT_SECRET_KEY` | api | random 32+ byte secret, e.g. `openssl rand -hex 32` |
| `ANTHROPIC_API_KEY` | api | for the Fathom-transcript task extraction feature |
| `FRONTEND_ORIGIN` | api | your deployed origin, for CORS (defaults to `http://localhost:5173`) |
| `VITE_SUPABASE_URL` | frontend (build-time) | same Supabase URL as above — the browser uploads/downloads project files directly to Supabase Storage via short-lived signed URLs, so it needs to know where to send them |
| `VITE_SUPABASE_ANON_KEY` | frontend (build-time) | the **anon** key (not service-role) — safe to embed in the client bundle by design; Supabase Storage still requires it on requests alongside the signed token |
| `TWILIO_ACCOUNT_SID` | api | optional — only needed for the Twilio MMS integration (see below) |
| `TWILIO_AUTH_TOKEN` | api | optional — **secret**; verifies incoming webhook requests are actually from Twilio |
| `PUBLIC_BASE_URL` | api | optional — your deployed origin (e.g. `https://mudmarbleos.vercel.app`), used to verify Twilio's webhook signature correctly behind Vercel's proxy |
| `CRON_SECRET` | api | required for email summaries — any long random string; the scheduler sends it as `Authorization: Bearer <secret>` to `/api/cron/notifications-tick` |
| `RESEND_API_KEY` | api | required to actually send email summaries (without it, previews still work and nothing is sent) |
| `EMAIL_FROM` | api | optional — defaults to `Mud & Marble OS <notify@notify.mudmarble.com>`; the domain must be verified in Resend |
| `MMOS_AGENT_WEBHOOK_URL` | api | optional — when a comment @-mentions an AI bot, the API POSTs one JSON body here. If this or `MMOS_AGENT_WEBHOOK_AUTH` is unset, the `agent_mentions` row is still saved and nothing is sent. |
| `MMOS_AGENT_WEBHOOK_AUTH` | api | optional **secret** — sent verbatim as the `Authorization` header on that POST. Do not add `Bearer ` unless the receiver expects the header to contain those characters. Never put either value in a `VITE_` variable. |

## First-time setup

1. Run the SQL files in `supabase/migrations/` (in order) against your Supabase project's SQL editor.
2. Create your team's login accounts:
   ```
   cd api && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
   export SUPABASE_URL=...
   export SUPABASE_SERVICE_ROLE_KEY=...
   python ../scripts/create_user.py
   ```
3. Set the environment variables above in Vercel, then deploy.

## Local development

```
# backend
cd api
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... JWT_SECRET_KEY=... uvicorn index:app --reload --port 8000 --app-dir .

# frontend (separate terminal) — proxies /api to localhost:8000, see frontend/vite.config.ts
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173`.

## AI bot @-mentions

Donna Paulsen, Mike Ross, Rachel Zane, Jessica Pearson, and Louis Litt show up in every comment box that already has @-mentions (task comments, project notes, rental work orders). They are labeled "AI bot". They are not login accounts, they are not in `app_users`, and they do not appear in the assignee picker.

1. Run `supabase/migrations/0091_agent_mentions.sql` in the Supabase SQL editor. Nothing in this repo applies SQL for you. Until it has been run, a comment still saves; the bot row is skipped and the API logs the failure.
2. In Vercel → Project → Settings → Environment Variables, set `MMOS_AGENT_WEBHOOK_URL` and `MMOS_AGENT_WEBHOOK_AUTH` on the **API** (Production, and Preview if a preview deployment should deliver). These stay on the server. Do not create Supabase Edge Function secrets for them — there is no edge function. The FastAPI app POSTs the JSON after the comment is saved.
3. Redeploy so the running API sees the new variables.
4. Deep links use `PUBLIC_BASE_URL` when it is set, otherwise `FRONTEND_ORIGIN`. Set `PUBLIC_BASE_URL` to the deployed origin (for example `https://mudmarbleos.vercel.app`) if the link should not point at localhost.

One comment that mentions two bots writes two `agent_mentions` rows and one POST:

```json
{
  "comment_id": "...",
  "mentioned_bots": ["Mike Ross", "Rachel Zane"],
  "author": "Brent Bridgman",
  "text": "...",
  "task": {"id": "...", "name": "..."},
  "job": {"id": "...", "name": "..."},
  "project": {"id": "...", "name": "..."},
  "link": "https://<origin>/tasks?task=...",
  "created_at": "..."
}
```

`job` and `project` are the same project. A rental mention with no project sends `null` for both. `delivered` becomes true after a 2xx response. `acked` stays false; nothing sets it yet. If the webhook is down, the API retries twice more, logs the status, and leaves `delivered` false. The comment response does not wait on that POST and does not fail when it fails.

A human @-mention still writes a `notifications` row and does not write `agent_mentions`.

## Twilio MMS setup (optional)

Lets crew text photos, videos, and plans to a phone number and have them auto-filed to the right
project (matched from the message text; if that fails, it texts back asking which project; if that
also fails, it lands in the admin Review page and notifies admins). Not required for the rest of the
app to work.

1. Run `supabase/migrations/0024_inbound_media.sql` (covered by the "run the SQL files in order" step
   above if you haven't set up the database yet).
2. Deploy the app (Twilio needs a real public URL to call — it can't reach localhost).
3. Sign up for [Twilio](https://www.twilio.com/) and buy a phone number with **MMS capability** (not
   all numbers support it — confirm at purchase).
4. Grab the **Account SID** and **Auth Token** from the Twilio Console.
5. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `PUBLIC_BASE_URL` in Vercel (see table above),
   then redeploy so they take effect.
6. In the Twilio Console: Phone Numbers → your number → Messaging Configuration → "A message comes
   in" → **Webhook**, **HTTP POST** → `https://<your-deployed-url>/api/twilio/sms`.
7. Text a photo to the number from a real phone to confirm it lands in the right project's Files tab.
