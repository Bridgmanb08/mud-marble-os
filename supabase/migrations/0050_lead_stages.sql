-- Makes the sales-stage pipeline admin-editable (rename existing stages,
-- add new ones) instead of the fixed 8-value vocabulary hardcoded in
-- Leads.tsx/types.ts. leads.status keeps using the same short "key" slugs
-- (new, stage_1, ...) as its stored value -- only the *label* shown to
-- users and the ability to add more keys becomes data-driven.
--
-- Drops the check constraint added in 0049: it enforced exactly the fixed
-- set of keys, which is incompatible with letting an admin add a brand new
-- stage from the UI without a follow-up migration every time. leads.status
-- becomes a plain free-text column validated at the application layer
-- against lead_stages, matching this app's existing convention for
-- "a list of labels that might grow" (see estimate_templates.category).
alter table leads drop constraint if exists leads_status_check;

create table if not exists lead_stages (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  sort_order integer not null default 0,
  is_open boolean not null default true,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  created_at timestamptz not null default now()
);

-- Seed with the current pipeline so nothing breaks for leads already using
-- these keys.
insert into lead_stages (key, label, sort_order, is_open, is_won, is_lost) values
  ('new', 'New', 0, true, false, false),
  ('stage_1', 'Stage 1: Initial Walkthrough', 1, true, false, false),
  ('stage_2', 'Stage 2: Working On Proposal', 2, true, false, false),
  ('stage_3', 'Stage 3: Negotiations', 3, true, false, false),
  ('stage_4', 'Stage 4: Paid For Initial Step', 4, true, false, false),
  ('stage_5', 'Stage 5: Signed!', 5, true, false, false),
  ('converted', 'Converted', 6, false, true, false),
  ('stage_6_lost', 'Stage 6: Missed Opportunity', 7, false, false, true)
on conflict (key) do nothing;

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
