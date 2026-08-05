-- Lets a rental file (photo/video) attach to a specific property visit, not
-- just a property or lease -- so a visit's "what did it look like" record can
-- carry its own photos/video, reusing the existing rental-files storage
-- bucket/upload flow rather than inventing a parallel one.
alter table rental_files add column if not exists visit_id uuid references rental_property_visits(id) on delete cascade;

create index if not exists idx_rental_files_visit on rental_files(visit_id);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
