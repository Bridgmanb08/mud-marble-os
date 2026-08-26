-- Replaces the open-ended rental_property_details log (migration 0055) with
-- a fixed set of "house facts" fields directly on rental_properties -- each
-- a plain-text value plus its own date column, matching the exact same
-- "boxes like the financials" convention as purchase_value/debt/etc.
-- (literal named columns, PATCH-on-blur), per explicit correction that the
-- open-ended log wasn't the right shape for this.
--
-- The rental_property_details table from migration 0055 is intentionally
-- left in place, unused -- dropping a table outright is a destructive,
-- hard-to-reverse action, and this one is empty/harmless sitting idle.
alter table rental_properties
  add column if not exists roof text,
  add column if not exists roof_date date,
  add column if not exists paint_color text,
  add column if not exists paint_color_date date,
  add column if not exists flooring text,
  add column if not exists flooring_date date,
  add column if not exists furnace_filter_size text,
  add column if not exists furnace_filter_size_date date,
  add column if not exists water_heater text,
  add column if not exists water_heater_date date,
  add column if not exists furnace text,
  add column if not exists furnace_date date,
  add column if not exists ac text,
  add column if not exists ac_date date,
  add column if not exists gutter_guards text,
  add column if not exists gutter_guards_date date,
  add column if not exists downspouts text,
  add column if not exists downspouts_date date,
  add column if not exists tree_issues text,
  add column if not exists tree_issues_date date;

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
