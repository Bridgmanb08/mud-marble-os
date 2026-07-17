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
