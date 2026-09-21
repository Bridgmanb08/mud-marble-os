-- A permit/inspection number to record next to each permit's checkbox and
-- date on the project overview (so Shannon can note the number the city
-- issued instead of it living in a separate note).
alter table projects
  add column if not exists permit_structural_number text,
  add column if not exists permit_plumbing_number text,
  add column if not exists permit_electrical_number text,
  add column if not exists permit_hvac_number text,
  add column if not exists foundation_inspection_number text;
