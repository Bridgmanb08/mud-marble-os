-- projects.status has a check constraint that predates this migrations
-- folder and never included every status value the app actually uses
-- (pre_construction, punch_list, lost) -- setting a project to
-- pre_construction was failing with "violates check constraint
-- projects_status_check". Recreate it with the full set of statuses used
-- throughout the app (frontend PROJECT_STATUS_OPTIONS, api/app/ai_tools.py).
alter table projects drop constraint if exists projects_status_check;
alter table projects add constraint projects_status_check
  check (status in (
    'lead', 'vetting', 'estimating', 'proposed', 'pre_construction',
    'active', 'complete', 'on_hold', 'punch_list', 'lost'
  ));
