-- Adds a punch-list flag to tasks so the Task Board can offer a dedicated
-- "Punch list" tab alongside My tasks / All tasks, without overloading the
-- free-text `phase` field.
alter table schedule_items add column if not exists is_punch_list boolean not null default false;

create index if not exists schedule_items_is_punch_list_idx
  on schedule_items(is_punch_list)
  where is_punch_list = true;
