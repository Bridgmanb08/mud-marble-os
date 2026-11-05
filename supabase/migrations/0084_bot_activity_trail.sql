-- Who changed a task, a project schedule field, or a calendar event.
-- Run this yourself in the Supabase SQL editor (project boekqzxgooinrhxlckbp).
-- Do not apply it from CI. The app keeps working before this runs: new columns
-- are written best-effort, and a row with no actor shows as unknown/legacy,
-- never as a bot.
--
-- field_changes (0081) already stores old → new for projects, estimates, and
-- clients. This adds actor type (human vs bot), an optional source (meeting
-- name/date), the kind of action, and the project the change belongs to so a
-- project page can list task and calendar edits too.

alter table field_changes add column if not exists actor_type text;
alter table field_changes add column if not exists source text;
alter table field_changes add column if not exists action text not null default 'update';
alter table field_changes add column if not exists project_id uuid;

alter table field_changes drop constraint if exists field_changes_actor_type_check;
alter table field_changes add constraint field_changes_actor_type_check
  check (actor_type is null or actor_type in ('human', 'bot'));

alter table field_changes drop constraint if exists field_changes_action_check;
alter table field_changes add constraint field_changes_action_check
  check (action in ('create', 'update', 'comment', 'delete'));

create index if not exists field_changes_project_idx
  on field_changes(project_id, created_at desc);

-- Denormalized breadcrumb so the task board can show a bot badge without
-- joining the history table. NULL means unknown/legacy — never inferred.
alter table schedule_items add column if not exists created_by_name text;
alter table schedule_items add column if not exists created_by_type text;
alter table schedule_items add column if not exists updated_by_name text;
alter table schedule_items add column if not exists updated_by_type text;
alter table schedule_items add column if not exists updated_at timestamptz;

alter table schedule_items drop constraint if exists schedule_items_created_by_type_check;
alter table schedule_items add constraint schedule_items_created_by_type_check
  check (created_by_type is null or created_by_type in ('human', 'bot'));

alter table schedule_items drop constraint if exists schedule_items_updated_by_type_check;
alter table schedule_items add constraint schedule_items_updated_by_type_check
  check (updated_by_type is null or updated_by_type in ('human', 'bot'));

alter table calendar_events add column if not exists created_by_name text;
alter table calendar_events add column if not exists created_by_type text;
alter table calendar_events add column if not exists updated_by_name text;
alter table calendar_events add column if not exists updated_by_type text;

alter table calendar_events drop constraint if exists calendar_events_created_by_type_check;
alter table calendar_events add constraint calendar_events_created_by_type_check
  check (created_by_type is null or created_by_type in ('human', 'bot'));

alter table calendar_events drop constraint if exists calendar_events_updated_by_type_check;
alter table calendar_events add constraint calendar_events_updated_by_type_check
  check (updated_by_type is null or updated_by_type in ('human', 'bot'));

-- One row per bot token. Store only the SHA-256 hex of the token, never the
-- token itself. Brent generates the token locally, inserts the hash here, and
-- gives the plaintext to that bot's secret store. Revoke by setting revoked_at.
-- See docs/bot-write-api.md. Alternatively set BOT_API_KEYS on Vercel and skip
-- this table.
create table if not exists bot_credentials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  token_sha256 text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists bot_credentials_active_idx
  on bot_credentials(token_sha256)
  where revoked_at is null;

alter table bot_credentials enable row level security;

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
