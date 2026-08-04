-- Lets Shannon (or whoever's reconciling the In-House Sheet) mark a
-- subcontractor contract line item as confirmed with the sub, record when
-- that confirmation happened, and attach a screenshot (e.g. a text thread
-- showing the sub agreed to the price/scope) as proof.
alter table project_subcontractor_items add column if not exists confirmed boolean not null default false;
alter table project_subcontractor_items add column if not exists confirmed_at date;

-- Mirrors file_task_links (0010_project_files.sql) -- same project_files
-- table and storage bucket, just a different join target.
create table if not exists file_subitem_links (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references project_files(id) on delete cascade,
  subitem_id uuid not null references project_subcontractor_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(file_id, subitem_id)
);

create index if not exists file_subitem_links_subitem_id_idx on file_subitem_links(subitem_id);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
