-- Change orders can be marked paid / unpaid (or partly paid), like invoices:
-- how much has been paid on this change order, and the date it was paid.
alter table change_orders
  add column if not exists amount_paid numeric not null default 0,
  add column if not exists paid_date date;

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
