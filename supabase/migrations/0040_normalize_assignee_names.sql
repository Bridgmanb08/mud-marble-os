-- One-off backfill: several older code paths (the Fathom transcript
-- extraction prompt, hand-typed entries) assigned tasks using a lowercase
-- first-name shorthand ("shannon", "brent", ...) instead of the person's
-- real full name. Anything that matches a person's own tasks by exact name
-- (TeamReminders' "is this my task" check, team-workload aggregation)
-- compares against app_users.name (e.g. "Shannon Ingram"), so a task
-- assigned as "shannon" silently never matched. This normalizes every
-- existing row to the canonical full name; going forward, the app
-- normalizes automatically at write time (see api/app/team_roster.py).
update schedule_items
set assigned_to = case lower(trim(assigned_to))
  when 'brent' then 'Brent Bridgman'
  when 'shannon' then 'Shannon Ingram'
  when 'megan' then 'Megan Martens'
  when 'faith' then 'Faith Wyatt'
  when 'alex' then 'Alex Peralta'
  when 'manuel' then 'Manuel Alvarado'
  else assigned_to
end
where lower(trim(assigned_to)) in ('brent', 'shannon', 'megan', 'faith', 'alex', 'manuel');

update schedule_items
set assignees = (
  select jsonb_agg(
    case lower(trim(elem))
      when 'brent' then 'Brent Bridgman'
      when 'shannon' then 'Shannon Ingram'
      when 'megan' then 'Megan Martens'
      when 'faith' then 'Faith Wyatt'
      when 'alex' then 'Alex Peralta'
      when 'manuel' then 'Manuel Alvarado'
      else elem
    end
  )
  from jsonb_array_elements_text(assignees) as elem
)
where exists (
  select 1 from jsonb_array_elements_text(assignees) as elem
  where lower(trim(elem)) in ('brent', 'shannon', 'megan', 'faith', 'alex', 'manuel')
);
