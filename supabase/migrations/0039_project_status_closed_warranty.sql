-- Renames the project status 'complete' -> 'closed' (Shannon's preferred term
-- while backfilling old jobs) and adds a new 'warranty' status for jobs that
-- are done but still inside their warranty period. Distinct from
-- schedule_items.status, which independently uses the literal 'complete' for
-- tasks and is untouched by this migration.
update projects set status = 'closed' where status = 'complete';

alter table projects drop constraint if exists projects_status_check;
alter table projects add constraint projects_status_check
  check (status in (
    'lead', 'vetting', 'estimating', 'proposed', 'pre_construction',
    'active', 'closed', 'warranty', 'on_hold', 'punch_list', 'lost'
  ));
