alter table transactions add column if not exists subcontractor_id uuid references subcontractors(id) on delete set null;

alter table projects add column if not exists checking_balance numeric;
alter table projects add column if not exists credit_card_balance numeric;
alter table projects add column if not exists pending_invoices_manual numeric;

create table if not exists project_subcontractor_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  subcontractor_id uuid not null references subcontractors(id) on delete cascade,
  description text,
  amount numeric not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists project_subcontractor_items_project_id_idx on project_subcontractor_items(project_id);
create index if not exists project_subcontractor_items_sub_id_idx on project_subcontractor_items(subcontractor_id);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
