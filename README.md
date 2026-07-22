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
