-- The database itself rejects a markup_type other than the original two:
--   new row for relation "estimate_line_items" violates check constraint
--   "estimate_line_items_markup_type_check"
-- That constraint came from the table's original definition (it's in no
-- migration file), so saving a line item with the new "Profit per unit"
-- markup failed at the database no matter what the app sent. Replace it with
-- one that also allows 'per_unit'. Any existing check on markup_type is
-- found by definition rather than by name, on both the line items table and
-- the template items table that shares the same markup types.
do $$
declare
  tbl text;
  con record;
begin
  foreach tbl in array array['estimate_line_items', 'estimate_template_items'] loop
    for con in
      select c.conname
      from pg_constraint c
      where c.conrelid = ('public.' || tbl)::regclass
        and c.contype = 'c'
        and pg_get_constraintdef(c.oid) ilike '%markup_type%'
    loop
      execute format('alter table public.%I drop constraint %I', tbl, con.conname);
    end loop;
    execute format(
      'alter table public.%I add constraint %I check (markup_type in (''percent'', ''flat'', ''per_unit''))',
      tbl, tbl || '_markup_type_check'
    );
  end loop;
end $$;
