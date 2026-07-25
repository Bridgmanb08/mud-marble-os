create table if not exists person_tags (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  color text not null default '#7B4B34',
  created_at timestamptz not null default now()
);

create table if not exists person_tag_links (
  id uuid primary key default gen_random_uuid(),
  tag_id uuid not null references person_tags(id) on delete cascade,
  entity_type text not null check (entity_type in ('client', 'subcontractor', 'lead')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  unique(tag_id, entity_type, entity_id)
);

create index if not exists idx_person_tag_links_entity on person_tag_links(entity_type, entity_id);
create index if not exists idx_person_tag_links_tag on person_tag_links(tag_id);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
