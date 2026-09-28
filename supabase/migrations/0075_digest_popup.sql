-- In-app popup of the morning brief, shown about a minute after someone starts
-- working in the app. Per-person on/off (default on), plus one state row per
-- person per day so "dismissed" and "snoozed until" follow them across
-- devices and browser tabs instead of living in one browser's storage.
alter table notification_prefs add column if not exists popup_enabled boolean not null default true;

create table if not exists digest_popup_state (
  user_id uuid not null references app_users(id) on delete cascade,
  kind text not null default 'morning',
  local_date date not null,
  status text not null default 'shown',
  snoozed_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, local_date)
);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
