-- Renewal tracking on leases (mirrors the "Renewing?" checkbox + "Rent
-- Increase" columns on Brent's real Rental Dashboard spreadsheet) and a
-- property-visit log (mirrors its "Last Visited" / "Days Since Visit"
-- columns). renewal_status is 3-state (not just a checkbox) so "haven't
-- decided yet" is distinguishable from "decided not to renew" -- a real
-- improvement over the spreadsheet's binary checkbox, not just a port of it.
alter table rental_leases add column if not exists renewal_status text not null default 'undecided';
alter table rental_leases add column if not exists renewal_rent_increase numeric;

-- A log table (not a single mutable "last visited" column) so there's a
-- real history of visits, not just the most recent one -- matches this
-- app's established convention of deriving current state from an event log
-- (rental_payments -> is_late, task status -> overdue) rather than trusting
-- a single hand-maintained field.
create table if not exists rental_property_visits (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references rental_properties(id) on delete cascade,
  visited_at date not null default current_date,
  visited_by text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_rental_property_visits_property on rental_property_visits(property_id, visited_at desc);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
