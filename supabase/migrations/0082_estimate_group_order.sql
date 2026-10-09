-- The order of the groups on an estimate, saved on its own. Until now a
-- group's position was only implied by where its first line item happened to
-- sit in the list, so moving (or re-grouping) one line item could shuffle the
-- groups. This is the list of group names, top to bottom, exactly as the
-- worksheet, the PDF and the Excel export show them. Groups not in the list
-- (a brand-new one) go after it.
alter table estimates
  add column if not exists group_order jsonb not null default '[]'::jsonb;

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
