-- Per-user saved layout for the Projects page's status-grouped board: the
-- order the status sections (Lead, Active, Closed, etc.) are displayed in,
-- and which ones are collapsed. One row per user, same "get-or-create on
-- first load, PUT to save" shape as dashboard_layouts (migration 0004).
create table if not exists project_board_layout (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade unique,
  status_order jsonb not null default '[]'::jsonb,
  collapsed_statuses jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
