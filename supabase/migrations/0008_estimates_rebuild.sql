-- Proposal metadata on estimates. Additive only — no columns dropped or renamed,
-- so this is safe even if a trigger/view elsewhere depends on the existing shape.
alter table estimates add column if not exists title text;
alter table estimates add column if not exists approval_deadline date;
alter table estimates add column if not exists introductory_text text;
alter table estimates add column if not exists closing_text text;
alter table estimates add column if not exists sent_at timestamptz;
alter table estimates add column if not exists last_viewed_at timestamptz;

-- Worksheet line item fields: group_name (free-form section header, e.g. "Allowance",
-- "Interior Work"), title (short item name), quantity/unit/unit_cost + cost_type replace
-- the old day_labor_cost/material_cost/subcontractor_cost/contingency breakdown as the
-- primary costing model. The old columns are left in place (unused going forward) rather
-- than dropped, since we don't have visibility into whether anything else references them.
alter table estimate_line_items add column if not exists group_name text;
alter table estimate_line_items add column if not exists title text;
alter table estimate_line_items add column if not exists quantity numeric not null default 1;
alter table estimate_line_items add column if not exists unit text;
alter table estimate_line_items add column if not exists unit_cost numeric not null default 0;
alter table estimate_line_items add column if not exists cost_type text not null default 'none';

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
