-- Supports assigning multiple people to a task, and flagging a task as
-- needing clarification from someone specific. `assigned_to` is kept as a
-- synced "primary assignee" (server sets it to assignees[0]) so existing
-- filters/grouping/widgets built against the single field keep working
-- unchanged; `assignees` is the new source of truth for "who's on this."
alter table schedule_items add column if not exists assignees jsonb not null default '[]'::jsonb;
alter table schedule_items add column if not exists clarify_from text;

update schedule_items
set assignees = jsonb_build_array(assigned_to)
where assigned_to is not null and assigned_to <> '' and assignees = '[]'::jsonb;
