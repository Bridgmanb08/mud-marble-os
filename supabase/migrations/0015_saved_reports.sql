create table if not exists saved_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  name text not null,
  spec jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists saved_reports_user_id_idx on saved_reports(user_id);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
