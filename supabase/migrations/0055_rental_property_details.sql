-- Per-property "house facts" log -- paint colors, roof color/material,
-- appliance brands/models, major landscaping work, etc., each with its own
-- date (when it was done/installed/noted) so the team can tell whether a
-- given detail is current or years stale. A log table (not a fixed set of
-- named columns on rental_properties) since the set of things worth
-- tracking is open-ended and grows over time -- matches this app's
-- established "conventional values, not a rigid schema" convention
-- (category is free text like bucket/phase elsewhere), and the log shape
-- already proven by rental_property_visits for "one row per dated event".
create table if not exists rental_property_details (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references rental_properties(id) on delete cascade,
  category text not null,
  detail text not null,
  detail_date date,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_rental_property_details_property on rental_property_details(property_id, category);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
