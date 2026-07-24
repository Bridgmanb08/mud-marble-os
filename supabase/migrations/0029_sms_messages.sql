create table if not exists sms_messages (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  body text,
  message_sid text,
  project_id uuid references projects(id) on delete set null,
  sent_by uuid references app_users(id) on delete set null,
  storage_path text,
  mime_type text,
  file_type text,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_sms_messages_phone on sms_messages(phone_number, created_at);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
