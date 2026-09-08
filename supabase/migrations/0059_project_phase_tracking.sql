-- Construction phase tracker for the project Overview page: a fixed,
-- manually-advanced phase (current_phase, one of the values in
-- frontend/src/lib/projectPhases.ts / api/app/project_phases.py -- kept in
-- sync by hand since this is a short, stable, app-wide list, not
-- user-editable data), plus SOP checklist fields Shannon fills in per job:
-- permits (checkbox + date each, matching this app's established "fixed
-- boxes" convention for named per-project facts rather than an open log)
-- and a single current-status dumpster card.
alter table projects
  add column if not exists current_phase text,
  add column if not exists permit_structural_pulled boolean not null default false,
  add column if not exists permit_structural_date date,
  add column if not exists permit_plumbing_pulled boolean not null default false,
  add column if not exists permit_plumbing_date date,
  add column if not exists permit_electrical_pulled boolean not null default false,
  add column if not exists permit_electrical_date date,
  add column if not exists permit_hvac_pulled boolean not null default false,
  add column if not exists permit_hvac_date date,
  add column if not exists foundation_inspection_required boolean not null default false,
  add column if not exists foundation_inspection_date date,
  add column if not exists dumpster_on_site boolean not null default false,
  add column if not exists dumpster_size text,
  add column if not exists dumpster_supplier text;

-- Distinct from the existing `phase` column on schedule_items (already a
-- free-text label, populated from cost codes in the task form today, e.g.
-- "12.15 - Cabinets Install Labor" -- an unrelated, pre-existing concept).
-- This new column is specifically which fixed construction phase (Demo,
-- Framing, etc.) a scheduled task belongs to, for the new phase tracker's
-- per-phase schedule lookup.
alter table schedule_items add column if not exists construction_phase text;

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
