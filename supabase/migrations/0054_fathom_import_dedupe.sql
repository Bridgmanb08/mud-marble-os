alter table fathom_imports add column if not exists transcript_hash text;

create index if not exists idx_fathom_imports_hash on fathom_imports(transcript_hash);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
