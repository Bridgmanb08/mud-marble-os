-- Lightweight emoji reactions on task comments (iMessage-tapback style) --
-- one row per (comment, person, emoji); the unique constraint is what makes
-- "click the same emoji again to remove it" a plain toggle rather than
-- needing extra state.
create table if not exists task_comment_reactions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references task_comments(id) on delete cascade,
  author text not null,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique(comment_id, author, emoji)
);

create index if not exists idx_task_comment_reactions_comment on task_comment_reactions(comment_id);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
