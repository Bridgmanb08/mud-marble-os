-- Rounds out the existing leads table to match Brent's real "Sales Lead
-- Tracker" spreadsheet columns, so that spreadsheet can be retired in favor
-- of this app's Leads page instead of building a second, competing tracker.
-- Sales-stage vocabulary itself is not a new column -- it's a re-labeling of
-- the existing free-text `status` column (no CHECK constraint on this
-- pre-rewrite table, confirmed by grep across every migration that's ever
-- touched it), handled entirely at the application layer.
alter table leads add column if not exists project_scope text;
alter table leads add column if not exists projected_profit numeric;
alter table leads add column if not exists lead_temp text;
alter table leads add column if not exists notes text;
alter table leads add column if not exists objections text;

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
