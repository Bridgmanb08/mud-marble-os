-- ILP permit: another per-project permit on the Overview permits checklist,
-- same checkbox + date + number shape as structural/plumbing/electrical/HVAC.
-- Existing projects get it unchecked.
alter table projects
  add column if not exists permit_ilp_pulled boolean not null default false,
  add column if not exists permit_ilp_date date,
  add column if not exists permit_ilp_number text;
