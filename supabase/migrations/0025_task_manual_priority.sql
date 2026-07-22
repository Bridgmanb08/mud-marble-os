alter table schedule_items add column if not exists manual_position integer;

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
