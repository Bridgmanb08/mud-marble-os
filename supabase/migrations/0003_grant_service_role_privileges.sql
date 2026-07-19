-- service_role is missing the privileges Supabase normally grants by default,
-- on every existing table (confirmed via "permission denied for table leads"
-- and "permission denied for table app_users"). Fix it once for everything,
-- present and future, instead of granting table-by-table.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
