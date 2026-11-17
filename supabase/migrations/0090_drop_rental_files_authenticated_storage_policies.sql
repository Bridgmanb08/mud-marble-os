-- Remove the authenticated-role policies added in 0089 for the rental-files
-- bucket. Safe to re-run. Does not change the bucket size.
--
-- Run this yourself in the Supabase SQL editor. It is not applied automatically.
--
-- Why this is safe: Mud & Marble OS does not use Supabase Auth. The browser
-- never sends a Supabase user JWT. Uploads and downloads use signed URLs
-- minted by the API with the service role, and the service role bypasses
-- storage RLS. Those signed URLs worked before any policy existed (visit
-- files were uploaded with none). The policies below grant INSERT, UPDATE,
-- and object-read to the Supabase `authenticated` role. If email signups are
-- enabled on the project, anyone who creates a Supabase auth user would get
-- that role and could write into rental-files without an MM OS login.
-- Dropping them closes that door and does not change how the app reads or
-- writes files.

drop policy if exists "rental_files_read_known_object" on storage.objects;
drop policy if exists "rental_files_authenticated_insert" on storage.objects;
drop policy if exists "rental_files_authenticated_update" on storage.objects;
