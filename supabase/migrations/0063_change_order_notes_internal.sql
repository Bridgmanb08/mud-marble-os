-- Change orders only had `description` (client-facing scope text) -- no
-- internal-only notes field, matching the notes_internal/description split
-- estimates already have.
alter table change_orders add column if not exists notes_internal text;

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
