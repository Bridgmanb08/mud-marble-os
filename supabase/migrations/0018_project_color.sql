-- Lets each job be assigned a consistent display color, used everywhere a
-- job is shown alongside other jobs (the master schedule calendar and its
-- job filter list in particular) so a project reads the same color no
-- matter where it's shown.
alter table projects add column if not exists color text;
