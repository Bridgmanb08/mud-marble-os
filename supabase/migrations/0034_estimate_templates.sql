create table if not exists estimate_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists estimate_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references estimate_templates(id) on delete cascade,
  cost_code_id uuid references cost_codes(id) on delete set null,
  group_name text,
  bucket text not null default 'construction',
  title text not null,
  description text,
  quantity numeric not null default 1,
  unit text,
  unit_cost numeric not null default 0,
  cost_type text not null default 'none',
  builder_cost numeric not null default 0,
  markup_type text not null default 'percent',
  markup_value numeric not null default 0,
  owner_price numeric not null default 0,
  estimated_days numeric,
  notes_internal text,
  notes_external text,
  sort_order integer not null default 0
);

create index if not exists idx_estimate_template_items_template on estimate_template_items(template_id);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
