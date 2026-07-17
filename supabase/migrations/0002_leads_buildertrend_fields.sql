-- Adds the fields needed for the BuilderTrend-style "Lead Opportunities" list view.
alter table leads
  add column if not exists title text,
  add column if not exists confidence int,
  add column if not exists estimated_revenue_min numeric,
  add column if not exists estimated_revenue_max numeric,
  add column if not exists last_contacted_at timestamptz;
