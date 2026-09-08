-- Lets an old/superseded estimate version be archived (hidden from the default
-- Estimates list without deleting anything) instead of just piling up as clutter.
-- Deleting an estimate outright stays a hard DELETE with no soft-delete flag --
-- see the app-level guard in routers/estimates.py blocking it once a line item
-- has real invoiced history against it.
alter table estimates add column if not exists is_archived boolean not null default false;

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
