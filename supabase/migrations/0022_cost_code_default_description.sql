alter table cost_codes add column if not exists default_description text;

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
