-- Production's project_files table is missing mime_type (and possibly other
-- columns from its original 0010_project_files.sql definition -- this
-- session has repeatedly found tables whose live schema drifted from what
-- the migrations imply), which was 500ing every file upload with
-- "Could not find the 'mime_type' column ... in the schema cache". Re-adds
-- every column from that table's original definition, all idempotent, plus
-- an explicit schema-cache reload so PostgREST picks up the change
-- immediately instead of waiting for its own cache to expire.
alter table project_files
  add column if not exists uploaded_by uuid references app_users(id) on delete set null,
  add column if not exists file_name text,
  add column if not exists file_type text not null default 'other',
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint,
  add column if not exists storage_path text,
  add column if not exists created_at timestamptz not null default now();

notify pgrst, 'reload schema';
