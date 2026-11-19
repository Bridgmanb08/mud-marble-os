-- One row per AI bot @-mentioned in a comment, note, or work-order update.
-- Run this yourself in the Supabase SQL editor. It is not applied automatically.
-- It does not insert or update any existing row.
--
-- The five bots are not app_users and they cannot log in. The API (service
-- role) is the only writer. The browser never queries this table, so it
-- follows the same lock as app_users: RLS on, no policies, and the anon /
-- authenticated roles revoked. The service role bypasses RLS.
--
-- A job and a project are the same projects row in this app. job_id and
-- project_id are both stored so a reader can use either name. acked stays
-- false; nothing in the app sets it yet. delivered flips true after the
-- webhook returns 2xx.

create table if not exists agent_mentions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null,
  source_type text not null check (source_type in (
    'task_comment',
    'project_note',
    'rental_work_order',
    'rental_work_order_update'
  )),
  bot text not null check (bot in (
    'Donna Paulsen',
    'Mike Ross',
    'Rachel Zane',
    'Jessica Pearson',
    'Louis Litt'
  )),
  author text not null,
  author_id uuid references app_users(id) on delete set null,
  comment_text text not null,
  task_id uuid references schedule_items(id) on delete set null,
  task_name text,
  project_id uuid references projects(id) on delete set null,
  project_name text,
  job_id uuid references projects(id) on delete set null,
  job_name text,
  link text not null,
  delivered boolean not null default false,
  delivered_at timestamptz,
  acked boolean not null default false,
  acked_at timestamptz,
  delivery_attempts integer not null default 0,
  last_delivery_error text,
  created_at timestamptz not null default now(),
  unique (comment_id, bot)
);

create index if not exists agent_mentions_task_id_idx on agent_mentions(task_id);
create index if not exists agent_mentions_project_id_idx on agent_mentions(project_id);
create index if not exists agent_mentions_job_id_idx on agent_mentions(job_id);
create index if not exists agent_mentions_author_id_idx on agent_mentions(author_id);
create index if not exists agent_mentions_bot_created_idx on agent_mentions(bot, created_at desc);
create index if not exists agent_mentions_undelivered_idx on agent_mentions(created_at) where delivered = false;

alter table agent_mentions enable row level security;

revoke all on table agent_mentions from public, anon, authenticated;
grant all on table agent_mentions to service_role;
