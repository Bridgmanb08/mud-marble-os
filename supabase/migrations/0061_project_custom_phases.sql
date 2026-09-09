-- Lets a project insert a one-off custom phase (e.g. "Roof") between two of
-- the standard construction phases on the Project Overview's phase tracker,
-- without touching the app-wide default phase list every other project uses.
-- Shape: [{"key": "roof", "label": "Roof", "after": "framing"}, ...] --
-- merged into the default list at render/read time (see
-- api/app/project_phases.py's merge_custom_phases / the mirrored frontend
-- helper), never materialized into a full list, so the default list can
-- still change later without silently stale-copying it onto every project.
alter table projects add column if not exists custom_phases jsonb not null default '[]'::jsonb;

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
