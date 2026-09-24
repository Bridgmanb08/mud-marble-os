-- Lets a networking node represent something other than a person -- an
-- organization ("ABC Construction") or a title/role ("General Contractor"),
-- not just a named individual. Every existing row is a real person, so
-- defaults to 'person' rather than requiring a backfill.
alter table network_people add column if not exists node_type text not null default 'person';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'network_people_node_type_check') then
    alter table network_people
      add constraint network_people_node_type_check
      check (node_type in ('person', 'organization', 'title'));
  end if;
end $$;
