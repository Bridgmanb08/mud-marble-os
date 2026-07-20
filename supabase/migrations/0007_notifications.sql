create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  type text not null default 'mention',
  source_type text not null,
  source_id uuid,
  project_id uuid references projects(id) on delete cascade,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_idx on notifications(user_id, is_read);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
