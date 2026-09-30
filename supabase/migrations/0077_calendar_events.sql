-- A calendar entry that is NOT a task -- deliberately its own table, never
-- defaulting to a task link, per Brent's explicit ask: "these need to be
-- separate things that are stored separately... I don't want there to be a
-- default connection." Covers three cases with one shape:
--   - a free-standing event someone adds straight to the Schedule calendar
--   - a project's Start / Estimated Completion date, kept in sync automatically
--   - a phase's manual date on the Phase Tracker, same way
-- auto_kind marks the latter two ('project_start', 'project_completion',
-- 'phase:<phase_key>') so the backend can find and update/remove "the" event
-- for that project+kind instead of matching by title text (which could
-- collide with something a person typed by hand) or creating duplicates.
-- Left null for a genuine manual event -- there is no other link to a task.
create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  notes text,
  event_date date not null,
  auto_kind text,
  created_at timestamptz not null default now()
);

create index if not exists calendar_events_project_id_idx on calendar_events(project_id);
create index if not exists calendar_events_event_date_idx on calendar_events(event_date);

-- One auto-generated event per project+kind -- re-saving a date updates this
-- row in place instead of piling up duplicates.
create unique index if not exists calendar_events_project_auto_kind_idx
  on calendar_events(project_id, auto_kind)
  where auto_kind is not null;

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
