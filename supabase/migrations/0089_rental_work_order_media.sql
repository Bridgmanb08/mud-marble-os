-- Work-order photos, videos, and pasted links (including Google Photos),
-- plus the visit-file gaps those same uploads exposed.
--
-- Safe to re-run. Does not touch rent-roll rows or duplex properties.
-- Run this yourself in the Supabase SQL editor. Nothing here is applied
-- automatically.

-- ---- Work order comments and a queryable media/link table ------------------
-- One row per uploaded file or pasted link. A reviewer can answer
-- "what was attached to this work order, by whom, and what did the note say?"
-- without joining:
--
--   select work_order_id, property_id, uploaded_by, created_at,
--          coalesce(link_url, file_url) as file_url_or_link, update_text
--     from rental_work_order_media
--    where work_order_id = '<uuid>';
--
-- file_url is the stable Storage object URL (the bucket is private).
-- Open a file through the app:
--   GET /api/rental-work-orders/{work_order_id}/media/{id}/download
-- which returns a short-lived signed URL. link_url is a plain https URL
-- and opens directly. created_at is the timestamp. update_text is the
-- work-order description or the comment this file/link was attached to.
-- uploaded_by is app_users.id (join app_users.name for the person's name).
-- property_id is the rental property.

create table if not exists rental_work_order_updates (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references rental_work_orders(id) on delete cascade,
  author_id uuid references app_users(id) on delete set null,
  body text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists rental_work_order_media (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references rental_work_orders(id) on delete cascade,
  property_id uuid not null references rental_properties(id) on delete cascade,
  update_id uuid references rental_work_order_updates(id) on delete cascade,
  uploaded_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('photo', 'video', 'link')),
  file_url text,
  link_url text,
  update_text text,
  file_name text,
  mime_type text,
  size_bytes bigint,
  storage_path text,
  constraint rental_work_order_media_has_target check (
    link_url is not null or file_url is not null or storage_path is not null
  )
);

create index if not exists idx_rental_work_order_updates_wo
  on rental_work_order_updates(work_order_id, created_at);
create index if not exists idx_rental_work_order_media_wo
  on rental_work_order_media(work_order_id, created_at);
create index if not exists idx_rental_work_order_media_property
  on rental_work_order_media(property_id);

alter table rental_work_order_updates enable row level security;
alter table rental_work_order_media enable row level security;

-- The API uses the service role, which bypasses RLS. With no policies, the
-- anon and authenticated Data API roles cannot read these tables. Reviewers
-- query them from the SQL editor (or the service role), same as the other
-- rental tables the app already serves only through /api.

grant all on rental_work_order_updates to service_role;
grant all on rental_work_order_media to service_role;

-- ---- Pasted links on visits and leases are URLs, not .webloc files ---------
-- Dragging a Google Photos link on a Mac produces a ~303-byte .webloc plist.
-- Those rows already exist in rental_files (file_name like '%.webloc').
-- link_url holds the plain URL. storage_path stays for real photos/videos
-- and may be null for a link that was never a file.

alter table rental_files add column if not exists link_url text;
alter table rental_files alter column storage_path drop not null;

alter table rental_files drop constraint if exists rental_files_has_payload;
alter table rental_files add constraint rental_files_has_payload
  check (storage_path is not null or link_url is not null);

comment on column rental_files.link_url is
  'Plain-text https URL. For a macOS .webloc upload this is the URL inside the plist, not the file itself.';

-- NOTE — extracting URLs from existing .webloc objects.
-- SQL cannot read private Storage bytes, so this file does not rewrite
-- those rows by itself. The object is a small XML plist:
--
--   <key>URL</key>
--   <string>https://photos.google.com/...</string>
--
-- The API does the extraction the next time those files are listed or
-- opened (GET /api/rental-files): it downloads the object with the service
-- role, pulls the URL out, and writes rental_files.link_url. The .webloc
-- object is left in the bucket so the extraction can be repeated. Nothing
-- is deleted. After this migration has been run, opening a visit that has
-- those files fills link_url. Until then the list response still includes
-- the parsed URL in memory so the screen can show a clickable link.

-- ---- Visit photos were saved without a property ----------------------------
-- rental_files.property_id was left null whenever the file was attached only
-- by visit_id. Copy the property from the visit (and from the lease, for
-- lease documents that were never given one).

update rental_files f
   set property_id = v.property_id
  from rental_property_visits v
 where f.visit_id = v.id
   and f.property_id is null
   and v.property_id is not null;

update rental_files f
   set property_id = u.property_id
  from rental_leases l
  join rental_units u on u.id = l.unit_id
 where f.lease_id = l.id
   and f.property_id is null;

-- visited_by is not backfilled. Old visits don't record who walked the
-- property, and guessing from the uploader would mis-label them. New visits
-- and new uploads set it from the signed-in person.

-- ---- Bucket cap and read policy --------------------------------------------
-- The free plan rejects objects over 50 MB. Setting it on the bucket makes
-- Storage agree with the message the app shows before the upload starts.

update storage.buckets
   set file_size_limit = 52428800
 where id = 'rental-files';

-- rental-files is private and had no policies. The app never sends a
-- Supabase Auth JWT: the browser uploads and downloads through signed URLs
-- that the API mints with the service role (service role bypasses RLS).
-- Those signed URLs are the sanctioned read path:
--   GET /api/rental-files/{id}/download
--   GET /api/rental-work-orders/{work_order_id}/media/{id}/download
--
-- The policies below let a Supabase-authenticated session (the dashboard,
-- or a reviewer holding a user JWT) download a known object without being
-- able to list the bucket. allow_any_operation limits the SELECT to the
-- actual object read, which is what keeps a broad SELECT from becoming a
-- directory listing. Insert + select + update are all granted because
-- replacing an object (upsert) needs all three.

drop policy if exists "rental_files_read_known_object" on storage.objects;
create policy "rental_files_read_known_object"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'rental-files'
    and storage.allow_any_operation(array[
      'object.get_authenticated_info',
      'object.get_authenticated'
    ])
  );

drop policy if exists "rental_files_authenticated_insert" on storage.objects;
create policy "rental_files_authenticated_insert"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'rental-files');

drop policy if exists "rental_files_authenticated_update" on storage.objects;
create policy "rental_files_authenticated_update"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'rental-files')
  with check (bucket_id = 'rental-files');
