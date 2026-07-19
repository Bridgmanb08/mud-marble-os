alter table app_users add column if not exists role text not null default 'member';
alter table app_users add column if not exists is_admin boolean not null default false;

create table if not exists dashboard_layouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade unique,
  widgets jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table dashboard_layouts enable row level security;

-- Brent's account predates the role/is_admin columns.
update app_users set is_admin = true, role = 'owner' where email ilike 'brent@mudmarble.com';
