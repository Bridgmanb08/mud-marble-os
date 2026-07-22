alter table project_subcontractor_items add column if not exists source_line_item_id uuid references estimate_line_items(id) on delete set null;
alter table project_subcontractor_items add column if not exists builder_cost numeric;

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
