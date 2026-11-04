-- The job foreman picker should offer exactly two people: Alex and Manuel.
-- Adds them (with starting colors you can change under "Manage foremen…") if
-- they aren't already there. Safe to re-run; nothing is deleted.

insert into foremen (name, color, sort_order)
select v.name, v.color, v.sort_order
  from (values ('Alex', '#2F6FB5', 0), ('Manuel', '#D9822B', 1)) as v(name, color, sort_order)
 where not exists (select 1 from foremen f where lower(btrim(f.name)) = lower(v.name));

-- Anyone else in the list (they would also show in the picker), and how many
-- jobs they're on. Empty means Alex and Manuel are the only two.
select f.name, f.color, (select count(*) from projects p where p.foreman_id = f.id) as jobs
  from foremen f
 where lower(btrim(f.name)) not in ('alex', 'manuel')
 order by f.name;
