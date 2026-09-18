-- Optional custom display name for an invoice (e.g. "Window Allowance
-- Invoice") distinct from its invoice_number -- Brent wants to label
-- certain invoices by what they're for, not just by number.
alter table invoices add column if not exists title text;
