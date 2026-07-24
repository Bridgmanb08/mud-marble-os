create table if not exists estimate_text_defaults (
  id uuid primary key default gen_random_uuid(),
  introductory_text text,
  closing_text text,
  updated_at timestamptz not null default now()
);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
