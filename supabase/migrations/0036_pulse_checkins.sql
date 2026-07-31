-- Team pulse check-ins: a low-friction, EOS-inspired weekly temperature check
-- (workload 1-5, feeling stuck, gratitude, wins) so leadership gets a
-- routine, expected read on the team instead of relying on people to
-- volunteer that they're overwhelmed.
create table if not exists pulse_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  workload_rating smallint not null check (workload_rating between 1 and 5),
  feeling_stuck boolean not null default false,
  stuck_note text,
  grateful_for text,
  win text,
  created_at timestamptz not null default now()
);

create index if not exists idx_pulse_checkins_user_created on pulse_checkins(user_id, created_at desc);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
