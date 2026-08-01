-- Lets a lead reference a real client as its referrer (mirroring clients'
-- referred_by_client_id), and tracks which client/project a lead became once
-- converted, so the referral relationship and pipeline history survive
-- conversion instead of requiring everything to be re-typed and re-linked.
alter table leads add column if not exists referred_by_client_id uuid references clients(id) on delete set null;
alter table leads add column if not exists converted_client_id uuid references clients(id) on delete set null;
alter table leads add column if not exists converted_project_id uuid references projects(id) on delete set null;

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
