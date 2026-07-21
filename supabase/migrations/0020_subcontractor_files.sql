insert into storage.buckets (id, name, public)
values ('subcontractor-files', 'subcontractor-files', false)
on conflict (id) do nothing;

create table if not exists subcontractor_files (
  id uuid primary key default gen_random_uuid(),
  subcontractor_id uuid not null references subcontractors(id) on delete cascade,
  uploaded_by uuid references app_users(id) on delete set null,
  file_name text not null,
  file_type text not null default 'other',
  mime_type text,
  size_bytes bigint,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists subcontractor_files_sub_id_idx on subcontractor_files(subcontractor_id);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
