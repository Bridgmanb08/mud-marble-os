-- Gives change orders real line items with cost codes, mirroring how
-- estimate_line_items already works, instead of a single flat title/
-- description/owner_price typed straight onto the change order itself.
-- A separate table rather than reusing estimate_line_items (adding a
-- nullable change_order_id there) on purpose -- that table and every piece
-- of logic built against it (PDF/Excel export, the invoicing picker,
-- financial-summary/cost-code-variance rollups, template duplication) all
-- assume every row belongs to exactly one estimate; blurring that would
-- touch a lot of already-working, heavily-used code for a comparatively
-- small, self-contained feature.
create table if not exists change_order_line_items (
  id uuid primary key default gen_random_uuid(),
  change_order_id uuid not null references change_orders(id) on delete cascade,
  cost_code_id uuid references cost_codes(id) on delete set null,
  title text not null,
  description text,
  quantity numeric not null default 1,
  unit text,
  unit_cost numeric not null default 0,
  cost_type text not null default 'none',
  markup_type text not null default 'percent',
  markup_value numeric not null default 0,
  builder_cost numeric not null default 0,
  owner_price numeric not null default 0,
  notes_internal text,
  notes_external text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_change_order_line_items_co_id on change_order_line_items(change_order_id);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
