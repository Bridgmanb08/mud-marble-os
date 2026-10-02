-- A safety net for hard deletes: before an estimate (and its line items) is
-- removed, a full copy goes here so it can be restored from "Recently
-- deleted" instead of being gone for good. `kind` leaves room for other
-- record types later. project_id is deliberately NOT a foreign key -- the
-- copy has to survive even if its project is later removed.
create table if not exists deleted_records (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  original_id uuid not null,
  project_id uuid,
  label text not null,
  summary jsonb not null default '{}'::jsonb,
  payload jsonb not null,
  deleted_by text,
  deleted_at timestamptz not null default now()
);

create index if not exists deleted_records_kind_deleted_at_idx on deleted_records(kind, deleted_at desc);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
