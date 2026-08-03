-- Per-user preference for the floating quick-task button (formerly the
-- ad hoc "quick reminder" checklist widget, repurposed into a fast-capture
-- task creator). Defaults to off -- Brent isn't sure anyone besides himself
-- will want it, so each person opts in for themselves via Settings rather
-- than it being on by default for the whole team.
alter table app_users add column if not exists quick_task_widget_enabled boolean not null default false;
