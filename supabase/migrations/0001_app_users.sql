-- Login accounts for the FastAPI-backed app. Run this once in the Supabase SQL editor.
create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  name text not null,
  created_at timestamptz not null default now()
);

-- Row Level Security: this table is only ever read/written by the backend using the
-- service-role key (which bypasses RLS), so keep it locked down from the anon/authenticated
-- roles that the old client-side code used.
alter table app_users enable row level security;
