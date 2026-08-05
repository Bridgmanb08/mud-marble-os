-- Rental property investment-schedule fields, mirroring Brent's real
-- "Business Real Estate Schedule" spreadsheet: purchase value, debt, target
-- rent, taxes/insurance/mortgage/maintenance carrying costs, and loan/
-- ownership identifiers. This is separate from the operational lease/rent-
-- ledger data (rental_leases/rental_payments) -- a property's *actual*
-- collected rent still comes from real leases; these are the underlying
-- investment numbers (value, debt, target rent, carrying costs) that don't
-- depend on a tenant being in place.
alter table rental_properties add column if not exists ownership_name text;
alter table rental_properties add column if not exists ownership_pct numeric;
alter table rental_properties add column if not exists purchase_value numeric;
alter table rental_properties add column if not exists debt numeric;
alter table rental_properties add column if not exists target_monthly_rent numeric;
alter table rental_properties add column if not exists interest_rate numeric;
alter table rental_properties add column if not exists mortgage_payment numeric;
alter table rental_properties add column if not exists loan_number text;
alter table rental_properties add column if not exists lender text;
alter table rental_properties add column if not exists taxes_monthly numeric;
alter table rental_properties add column if not exists insurance_annual numeric;
alter table rental_properties add column if not exists insurance_monthly numeric;
alter table rental_properties add column if not exists other_expenses_monthly numeric;
alter table rental_properties add column if not exists maintenance_monthly numeric;
alter table rental_properties add column if not exists mowing_monthly numeric;
alter table rental_properties add column if not exists utilities_monthly numeric;
alter table rental_properties add column if not exists year_acquired integer;
alter table rental_properties add column if not exists parcel_number text;

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
