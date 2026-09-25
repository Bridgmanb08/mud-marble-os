-- Per-person settings for the server-side email digests (morning brief and
-- end-of-day wrap-up). One row per user; a user with no row gets the defaults
-- below, so nobody has to opt in row by row.
create table if not exists notification_prefs (
  user_id uuid primary key references app_users(id) on delete cascade,
  email_enabled boolean not null default true,
  morning_enabled boolean not null default true,
  morning_time text not null default '07:00',
  wrapup_enabled boolean not null default true,
  wrapup_time text not null default '16:30',
  timezone text not null default 'America/Indianapolis',
  updated_at timestamptz not null default now()
);

-- One row per (person, digest, channel, local day). The unique key is what
-- makes a double send impossible even when two scheduler ticks overlap: the
-- row is inserted BEFORE sending, and a second insert for the same day fails.
create table if not exists notification_send_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  kind text not null,
  channel text not null default 'email',
  local_date date not null,
  status text not null default 'claimed',
  detail text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (user_id, kind, channel, local_date)
);

create index if not exists notification_send_log_created_idx on notification_send_log(created_at desc);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
