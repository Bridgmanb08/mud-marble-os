create table if not exists fathom_imports (
  id uuid primary key default gen_random_uuid(),
  imported_at timestamptz not null default now(),
  imported_by text,
  meeting_title text,
  summary text,
  meeting_date text,
  attendees jsonb not null default '[]'::jsonb,
  task_count integer not null default 0,
  project_id uuid references projects(id) on delete set null
);

create index if not exists idx_fathom_imports_imported_at on fathom_imports(imported_at desc);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
