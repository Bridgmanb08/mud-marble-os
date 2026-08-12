alter table notification_settings add column if not exists visit_reminder_days integer not null default 30;

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
