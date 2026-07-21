-- Lightweight, global "quick reminder" checkboxes. Deliberately separate
-- from schedule_items: these are not real tasks (no project/status/etc
-- required), just a fast way to nudge yourself or the team from anywhere
-- in the app. A null assigned_to means "whole team" (visible to everyone
-- until someone checks it off).
create table if not exists quick_reminders (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references app_users(id) on delete cascade,
  assigned_to uuid references app_users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  message text not null,
  is_done boolean not null default false,
  created_at timestamptz not null default now(),
  dismissed_at timestamptz
);

create index if not exists quick_reminders_assigned_to_idx on quick_reminders(assigned_to, is_done);
create index if not exists quick_reminders_created_by_idx on quick_reminders(created_by, is_done);

grant all on all tables in schema public to service_role;
