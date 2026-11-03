-- One concept instead of two: a line item's "Group" is now just its "Bucket".
-- The three default buckets (Construction / Allowance / PM Fee) stay, and any
-- other bucket (Flooring, Demo, ...) is a named bucket that counts as one of
-- those three in the totals. Nothing is dropped or renamed in the schema --
-- group_name still holds a custom bucket's name -- so exports, invoicing and
-- totals keep working exactly as before.
--
-- This is the data cleanup half: tidy the existing bucket names so the same
-- bucket isn't spread over spelling variants (e.g. "Flooring", "flooring ",
-- "Floors" all become one "Flooring" bucket per estimate), and keep the saved
-- bucket order (estimates.group_order) pointing at the new names.
--
-- Safe to re-run. The original name is copied to group_name_original first
-- (only if not already saved), so nothing is lost.

alter table estimate_line_items add column if not exists group_name_original text;
alter table estimate_template_items add column if not exists group_name_original text;

update estimate_line_items set group_name_original = group_name
 where group_name_original is null and group_name is not null;
update estimate_template_items set group_name_original = group_name
 where group_name_original is null and group_name is not null;

-- ---- Estimates (and the shared line-items table) ----------------------------

drop table if exists _norm, _canon, _renames, _tnorm, _tcanon;

create temp table _norm as
select id, estimate_id, group_name as old_name,
       nullif(regexp_replace(btrim(group_name), '\s+', ' ', 'g'), '') as cleaned
  from estimate_line_items
 where group_name is not null;

-- All the flooring spellings are one bucket.
update _norm set cleaned = 'Flooring'
 where lower(cleaned) in ('floor', 'floors', 'flooring', 'floorings', 'floor covering', 'floor coverings');

-- The default buckets always use their standard spelling.
update _norm set cleaned = case lower(cleaned)
    when 'construction' then 'Construction'
    when 'allowance' then 'Allowance'
    when 'pm fee' then 'PM Fee'
  end
 where lower(cleaned) in ('construction', 'allowance', 'pm fee');

-- Same name in different capitalization on one estimate: keep whichever
-- spelling is used most (ties: alphabetical) for all of them.
create temp table _canon as
select distinct on (estimate_id, lower(cleaned)) estimate_id, lower(cleaned) as k, cleaned as canon
  from (
    select estimate_id, cleaned, count(*) as c
      from _norm
     where cleaned is not null
     group by estimate_id, cleaned
  ) t
 order by estimate_id, lower(cleaned), c desc, cleaned;

update _norm n set cleaned = c.canon
  from _canon c
 where n.estimate_id is not distinct from c.estimate_id
   and lower(n.cleaned) = c.k
   and n.cleaned <> c.canon;

-- Old name -> new name, per estimate (used to keep the saved bucket order).
create temp table _renames as
select distinct estimate_id, old_name as from_name, cleaned as to_name
  from _norm
 where estimate_id is not null and cleaned is not null and old_name <> cleaned;

update estimate_line_items li set group_name = n.cleaned
  from _norm n
 where li.id = n.id and li.group_name is distinct from n.cleaned;

-- Saved bucket order: rename entries, then drop duplicates that merged
-- (keeping the first position).
update estimates e set group_order = coalesce((
    select jsonb_agg(nm order by first_pos)
      from (
        select coalesce(r.to_name, t.g) as nm, min(t.pos) as first_pos
          from jsonb_array_elements_text(e.group_order) with ordinality as t(g, pos)
          left join _renames r on r.estimate_id = e.id and r.from_name = t.g
         group by coalesce(r.to_name, t.g)
      ) x
  ), '[]'::jsonb)
 where jsonb_typeof(e.group_order) = 'array'
   and exists (select 1 from _renames r where r.estimate_id = e.id);

-- ---- Estimate templates -----------------------------------------------------

create temp table _tnorm as
select id, template_id,
       nullif(regexp_replace(btrim(group_name), '\s+', ' ', 'g'), '') as cleaned
  from estimate_template_items
 where group_name is not null;

update _tnorm set cleaned = 'Flooring'
 where lower(cleaned) in ('floor', 'floors', 'flooring', 'floorings', 'floor covering', 'floor coverings');

update _tnorm set cleaned = case lower(cleaned)
    when 'construction' then 'Construction'
    when 'allowance' then 'Allowance'
    when 'pm fee' then 'PM Fee'
  end
 where lower(cleaned) in ('construction', 'allowance', 'pm fee');

create temp table _tcanon as
select distinct on (template_id, lower(cleaned)) template_id, lower(cleaned) as k, cleaned as canon
  from (
    select template_id, cleaned, count(*) as c
      from _tnorm
     where cleaned is not null
     group by template_id, cleaned
  ) t
 order by template_id, lower(cleaned), c desc, cleaned;

update _tnorm n set cleaned = c.canon
  from _tcanon c
 where n.template_id = c.template_id and lower(n.cleaned) = c.k and n.cleaned <> c.canon;

update estimate_template_items ti set group_name = n.cleaned
  from _tnorm n
 where ti.id = n.id and ti.group_name is distinct from n.cleaned;

drop table if exists _norm, _canon, _renames, _tnorm, _tcanon;

-- What changed (for the record): how many line items now sit in a different
-- bucket name than before. The originals are in group_name_original.
select
  (select count(*) from estimate_line_items where group_name is distinct from group_name_original) as estimate_items_renamed,
  (select count(*) from estimate_template_items where group_name is distinct from group_name_original) as template_items_renamed;
