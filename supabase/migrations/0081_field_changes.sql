-- A running record of who changed what on the records people type into by
-- hand (projects, estimates, clients): one row per field that actually
-- changed, with the value before and after. Nothing reads this in the app yet;
-- it exists so that when a value turns up missing or wrong, the Supabase table
-- editor can answer "who changed it, when, and what was it before" -- and the
-- old value can be put back.
create table if not exists field_changes (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  field text not null,
  old_value jsonb,
  new_value jsonb,
  changed_by uuid,
  changed_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists field_changes_record_idx on field_changes(table_name, record_id, created_at desc);
create index if not exists field_changes_created_idx on field_changes(created_at desc);

alter table field_changes enable row level security;

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
