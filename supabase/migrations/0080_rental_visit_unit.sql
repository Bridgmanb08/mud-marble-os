-- A visit now belongs to a UNIT, not just a property. Before this, logging a
-- visit for "1409 unit A" recorded it against the whole address, so unit B
-- (a different tenant, possibly not visited at all) showed as visited too.
-- Nullable on purpose: every visit logged before this has no unit. Those are
-- treated as covering every unit at that address (exactly how they behaved
-- before) until someone assigns them to a specific unit in the visit editor.
alter table rental_property_visits
  add column if not exists unit_id uuid references rental_units(id) on delete cascade;

create index if not exists rental_property_visits_unit_idx
  on rental_property_visits(unit_id, visited_at desc);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
