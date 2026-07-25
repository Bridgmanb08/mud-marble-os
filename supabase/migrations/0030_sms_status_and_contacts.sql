alter table sms_messages add column if not exists status text;
alter table sms_messages add column if not exists error_code text;

create table if not exists sms_contacts (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null unique,
  name text,
  subcontractor_id uuid references subcontractors(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sms_contacts_subcontractor on sms_contacts(subcontractor_id);
create index if not exists idx_sms_contacts_project on sms_contacts(project_id);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
