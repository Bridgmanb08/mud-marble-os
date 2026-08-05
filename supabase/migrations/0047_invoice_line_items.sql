-- Lets an invoice be built from specific percentages/amounts of an
-- estimate's line items (BuilderTrend's "Add from Estimates" flow), instead
-- of only ever being one flat amount_due number. source_line_item_id is
-- nullable so a line can also be added freehand with no estimate reference,
-- same as estimate_line_items themselves don't require every field.
--
-- Deliberately no "already invoiced" column anywhere -- that amount is
-- computed live by summing invoice_line_items.amount grouped by
-- source_line_item_id (across every invoice for the project), matching
-- this app's established convention of deriving state from an event log
-- rather than storing a running total that can drift out of sync.
create table if not exists invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  source_line_item_id uuid references estimate_line_items(id) on delete set null,
  cost_code_id uuid references cost_codes(id) on delete set null,
  title text not null,
  description text,
  pct_of_line_item numeric,
  amount numeric not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_invoice_line_items_invoice on invoice_line_items(invoice_id);
create index if not exists idx_invoice_line_items_source on invoice_line_items(source_line_item_id);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
