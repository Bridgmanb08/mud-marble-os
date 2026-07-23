alter table clients add column if not exists referred_by_client_id uuid references clients(id) on delete set null;
alter table clients add column if not exists referral_gift_description text;

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
