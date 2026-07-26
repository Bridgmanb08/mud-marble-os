-- These tables are filtered by project_id/status/assigned_to on nearly every
-- page load (task list, project detail tabs, estimates/invoices/change-orders
-- lists, dashboard aggregation) but never got an explicit index -- every prior
-- migration added indexes for newer features and missed these core ones.
create index if not exists idx_schedule_items_project_id on schedule_items(project_id);
create index if not exists idx_schedule_items_status on schedule_items(status);
create index if not exists idx_schedule_items_assigned_to on schedule_items(assigned_to);

create index if not exists idx_estimates_project_id on estimates(project_id);
create index if not exists idx_estimate_line_items_estimate_id on estimate_line_items(estimate_id);

create index if not exists idx_transactions_project_id on transactions(project_id);
create index if not exists idx_invoices_project_id on invoices(project_id);
create index if not exists idx_change_orders_project_id on change_orders(project_id);
create index if not exists idx_project_notes_project_id on project_notes(project_id);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
