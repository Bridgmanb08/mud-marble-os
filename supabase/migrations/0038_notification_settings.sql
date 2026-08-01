create table if not exists notification_settings (
  id uuid primary key default gen_random_uuid(),
  smart_learning_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references app_users(id)
);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
