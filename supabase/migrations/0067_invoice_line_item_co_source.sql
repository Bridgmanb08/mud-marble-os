-- Lets an invoice line item reference a change-order line item too, the
-- same way source_line_item_id already lets one reference an estimate
-- line item -- needed so an approved change order's line items can be
-- pulled into an invoice ("Add from Change Order"), the same flow that
-- already exists for estimates. A separate column rather than reusing
-- source_line_item_id because that column has a real FK constraint to
-- estimate_line_items; the two source tables were deliberately kept
-- separate (see 0065_change_order_line_items.sql), so their invoice
-- references stay separate too. Mutually exclusive in practice -- an
-- invoice line item is sourced from at most one of the two.
alter table invoice_line_items add column if not exists source_co_item_id uuid references change_order_line_items(id) on delete set null;

create index if not exists idx_invoice_line_items_co_source on invoice_line_items(source_co_item_id);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
