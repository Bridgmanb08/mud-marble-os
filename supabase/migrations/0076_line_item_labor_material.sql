-- Splits a line item's unit cost into labor and material components so Brent
-- can carry separate labor/material cost projections through to his in-house
-- sheets. Both are nullable and purely additive: unit_cost itself is still
-- the number that drives builder_cost/owner_price everywhere downstream
-- (line_items.py derives it from labor+material whenever either is set), so
-- every existing row (and every code path that only ever sets a plain
-- unit_cost -- imports, the AI estimating copilot, templates) keeps working
-- unchanged with both new columns simply null.
alter table estimate_line_items add column if not exists unit_cost_labor numeric;
alter table estimate_line_items add column if not exists unit_cost_material numeric;

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
