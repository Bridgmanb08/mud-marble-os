-- Cleanup after 0068_unify_line_items.sql: change order items now live in
-- estimate_line_items and invoice lines use the single source_line_item_id,
-- so the old table and second source column are dead weight.
--
-- Re-runs the 0068 copy first (idempotent) to catch anything written to the
-- old table between 0068 and the new code deploying, then REFUSES to drop
-- anything if a change order item still isn't in estimate_line_items.

insert into estimate_line_items
  (id, change_order_id, bucket, cost_code_id, title, description, quantity, unit, unit_cost, cost_type,
   markup_type, markup_value, builder_cost, owner_price, notes_internal, notes_external, sort_order, created_at)
select id, change_order_id, 'construction', cost_code_id, title, description, quantity, unit, unit_cost, cost_type,
       markup_type, markup_value, builder_cost, owner_price, notes_internal, notes_external, sort_order, created_at
from change_order_line_items
on conflict (id) do nothing;

update invoice_line_items
   set source_line_item_id = source_co_item_id
 where source_co_item_id is not null
   and source_line_item_id is null
   and exists (select 1 from estimate_line_items e where e.id = invoice_line_items.source_co_item_id);

do $$
declare missing int;
begin
  select count(*) into missing
    from change_order_line_items c
   where not exists (select 1 from estimate_line_items e where e.id = c.id);
  if missing > 0 then
    raise exception 'Aborting: % change order item(s) were not copied to estimate_line_items', missing;
  end if;

  select count(*) into missing
    from invoice_line_items
   where source_co_item_id is not null and source_line_item_id is distinct from source_co_item_id;
  if missing > 0 then
    raise exception 'Aborting: % invoice line(s) still point only at the old change order source column', missing;
  end if;
end $$;

alter table invoice_line_items drop column if exists source_co_item_id;
drop table if exists change_order_line_items;
