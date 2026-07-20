alter table schedule_items add column if not exists subcontractor_id uuid references subcontractors(id) on delete set null;
