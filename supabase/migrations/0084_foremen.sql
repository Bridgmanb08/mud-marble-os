-- Foremen: the people who run jobs, each with a color (matched to the CFO
-- spreadsheet's color coding) so a job's foreman can be seen at a glance. A
-- project points at at most one foreman; deleting a foreman just un-assigns the
-- jobs that had them.
create table if not exists foremen (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#7B4B34',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table projects
  add column if not exists foreman_id uuid references foremen(id) on delete set null;

create index if not exists projects_foreman_idx on projects(foreman_id);

alter table foremen enable row level security;

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
