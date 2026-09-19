-- One line-item table for estimates AND change orders (and one source link
-- for invoices). estimate_line_items keeps its name -- renaming it would
-- break the code currently deployed while this runs -- but a row now
-- belongs to exactly ONE parent: an estimate OR a change order. Every
-- existing estimate query already filters by estimate_id, so change order
-- rows (estimate_id null) never leak into them.
--
-- Purely additive: the old change_order_line_items table and
-- invoice_line_items.source_co_item_id are left in place (copied, not
-- moved) so the currently-deployed code keeps working until the new code
-- ships. A follow-up cleanup migration drops them and re-runs the copy
-- below to catch any stragglers.

alter table estimate_line_items alter column estimate_id drop not null;

alter table estimate_line_items
  add column if not exists change_order_id uuid references change_orders(id) on delete cascade;

create index if not exists idx_estimate_line_items_change_order_id on estimate_line_items(change_order_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'line_items_exactly_one_parent') then
    alter table estimate_line_items
      add constraint line_items_exactly_one_parent
      check ((estimate_id is not null and change_order_id is null) or (estimate_id is null and change_order_id is not null));
  end if;
end $$;

-- Copy change order items across, keeping their ids so invoice references
-- stay valid.
insert into estimate_line_items
  (id, change_order_id, cost_code_id, title, description, quantity, unit, unit_cost, cost_type,
   markup_type, markup_value, builder_cost, owner_price, notes_internal, notes_external, sort_order, created_at)
select id, change_order_id, cost_code_id, title, description, quantity, unit, unit_cost, cost_type,
       markup_type, markup_value, builder_cost, owner_price, notes_internal, notes_external, sort_order, created_at
from change_order_line_items
on conflict (id) do nothing;

-- Invoice lines sourced from a change order item now use the one source column.
update invoice_line_items
   set source_line_item_id = source_co_item_id
 where source_co_item_id is not null
   and source_line_item_id is null
   and exists (select 1 from estimate_line_items e where e.id = invoice_line_items.source_co_item_id);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
