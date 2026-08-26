-- Per-user flag letting an admin hide a rental property's purchase value,
-- debt, and computed equity from a specific person's view -- e.g. a
-- property manager who needs full operational visibility (rent, expenses,
-- maintenance costs) but not ownership value/equity. This is the first
-- per-individual-user gate in this app (everything else is role-class,
-- is_admin-only) -- deliberately built as a reusable toggle any admin can
-- flip per person in Settings, not a one-off hardcoded check against a
-- specific name/email/id.
alter table app_users add column if not exists hide_rental_financials boolean not null default false;

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
