create table if not exists custom_widgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  title text not null,
  spec jsonb not null,
  created_at timestamptz not null default now()
);
alter table custom_widgets enable row level security;
