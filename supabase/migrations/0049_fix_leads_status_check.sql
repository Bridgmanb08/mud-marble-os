-- The leads.status check constraint predates this app's Phase 25 rework of
-- the sales pipeline into a 6-stage vocabulary (Leads.tsx's STAGE_OPTIONS /
-- types.ts's LeadStatus) and was never updated to match it -- it still only
-- allowed whatever short list of statuses the original pre-rewrite app used.
-- This silently rejected every real "stage_N" value from
-- scripts/import_sales_leads.py with a 23514 violation (28 of 70 real rows
-- failed on first run), while rows that happened to fall back to the
-- default 'new' succeeded and masked the problem.
alter table leads drop constraint if exists leads_status_check;
alter table leads add constraint leads_status_check
  check (status in ('new', 'stage_1', 'stage_2', 'stage_3', 'stage_4', 'stage_5', 'stage_6_lost', 'converted'));

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
