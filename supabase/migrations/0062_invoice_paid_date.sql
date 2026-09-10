-- Tracks the actual date money came in, separate from due_date (when it was
-- expected) and created_at (when the invoice record itself was made).
alter table invoices add column if not exists paid_date date;

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
