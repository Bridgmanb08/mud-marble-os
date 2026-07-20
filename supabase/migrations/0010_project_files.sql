insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do nothing;

create table if not exists project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  uploaded_by uuid references app_users(id) on delete set null,
  file_name text not null,
  file_type text not null default 'other',
  mime_type text,
  size_bytes bigint,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists project_files_project_id_idx on project_files(project_id);

create table if not exists file_task_links (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references project_files(id) on delete cascade,
  task_id uuid not null references schedule_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(file_id, task_id)
);

create index if not exists file_task_links_task_id_idx on file_task_links(task_id);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
