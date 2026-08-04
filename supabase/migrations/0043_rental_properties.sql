-- Rental Property Management module: properties/units/tenants/leases/payments/
-- work orders/lease files. New, self-contained data model -- nothing here
-- touches the existing construction-side tables.

insert into storage.buckets (id, name, public)
values ('rental-files', 'rental-files', false)
on conflict (id) do nothing;

create table if not exists rental_properties (
  id uuid primary key default gen_random_uuid(),
  address text not null,
  city text,
  state text,
  zip text,
  property_type text not null default 'single_family',
  notes text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists rental_units (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references rental_properties(id) on delete cascade,
  unit_label text not null default 'Main',
  bedrooms numeric,
  bathrooms numeric,
  square_feet numeric,
  created_at timestamptz not null default now()
);

create table if not exists rental_tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists rental_leases (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references rental_units(id) on delete cascade,
  tenant_id uuid not null references rental_tenants(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  monthly_rent numeric not null default 0,
  security_deposit numeric,
  rent_due_day integer not null default 1,
  notes text,
  created_at timestamptz not null default now()
);

-- lease_status ('upcoming'/'active'/'ended') is intentionally NOT a stored
-- column here -- computed on the API response from start_date/end_date vs.
-- today, matching this app's established convention for other date-derived
-- state (task overdue, CO sop_breach) rather than trusting a manually-set
-- flag that can go stale.

create table if not exists rental_payments (
  id uuid primary key default gen_random_uuid(),
  lease_id uuid not null references rental_leases(id) on delete cascade,
  due_date date not null,
  amount_due numeric not null default 0,
  amount_paid numeric,
  paid_date date,
  status text not null default 'due',
  notes text,
  unique(lease_id, due_date)
);

create table if not exists rental_work_orders (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references rental_properties(id) on delete cascade,
  unit_id uuid references rental_units(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'open',
  priority text not null default 'normal',
  assigned_to text,
  task_id uuid references schedule_items(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists rental_files (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references rental_properties(id) on delete cascade,
  lease_id uuid references rental_leases(id) on delete cascade,
  uploaded_by text,
  file_name text not null,
  file_type text not null default 'lease',
  mime_type text,
  size_bytes bigint,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_rental_units_property on rental_units(property_id);
create index if not exists idx_rental_leases_unit on rental_leases(unit_id);
create index if not exists idx_rental_leases_tenant on rental_leases(tenant_id);
create index if not exists idx_rental_payments_lease on rental_payments(lease_id);
create index if not exists idx_rental_work_orders_property on rental_work_orders(property_id);
create index if not exists idx_rental_files_property on rental_files(property_id);
create index if not exists idx_rental_files_lease on rental_files(lease_id);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
