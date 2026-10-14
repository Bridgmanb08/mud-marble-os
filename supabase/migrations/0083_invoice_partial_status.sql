-- A "partial" invoice status (some, but not all, of the invoice has been paid).
-- The invoices table predates this repo, so there may be an old CHECK
-- constraint on status that only allows the original values. Drop whatever
-- check(s) mention status, then put back one that includes 'partial'.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.invoices'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.invoices drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.invoices
  add constraint invoices_status_check
  check (status in ('draft', 'sent', 'partial', 'paid', 'overdue', 'void'));

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
