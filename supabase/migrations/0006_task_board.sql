alter table schedule_items add column if not exists priority text not null default 'normal';
alter table schedule_items add column if not exists position integer not null default 0;

create table if not exists task_subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references schedule_items(id) on delete cascade,
  title text not null,
  is_complete boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists task_dependencies (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references schedule_items(id) on delete cascade,
  depends_on_id uuid not null references schedule_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(task_id, depends_on_id)
);

create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references schedule_items(id) on delete cascade,
  author text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists board_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  name text not null,
  view_type text not null default 'kanban',
  group_by text,
  filters jsonb not null default '{}'::jsonb,
  sort_by text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
