-- Per-user saved layout for the Leads page's stage-grouped board -- same
-- shape as project_board_layout (0058_project_board_layout.sql), one row
-- per user: the order the sales-stage sections are displayed in, and which
-- ones are collapsed.
create table if not exists lead_board_layout (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade unique,
  stage_order jsonb not null default '[]'::jsonb,
  collapsed_stages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
