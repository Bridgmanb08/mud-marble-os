-- Photos/videos texted in via Twilio that couldn't be (or haven't yet been) tied to a project.
create table if not exists inbound_media (
  id uuid primary key default gen_random_uuid(),
  from_phone text not null,
  message_sid text not null unique,
  body text,
  storage_path text not null,
  mime_type text,
  file_type text not null default 'other',
  status text not null default 'awaiting_reply', -- awaiting_reply | needs_review | resolved
  project_id uuid references projects(id) on delete set null,
  resolved_file_id uuid references project_files(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists inbound_media_status_idx on inbound_media(status);
create index if not exists inbound_media_from_phone_idx on inbound_media(from_phone);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
