alter table schedule_items add column if not exists version integer not null default 1;
