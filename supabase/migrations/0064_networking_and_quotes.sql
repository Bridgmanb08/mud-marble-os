-- "Brent's Zone": a personal networking map (who introduced Brent to whom,
-- with cross-connections since a person can be reached through more than
-- one path) and a simple saved-quotes list. Both are plain CRUD tables --
-- the network's *shape* lives entirely in network_connections edges, not in
-- any parent/child column on network_people, so a person can have any
-- number of incoming and outgoing connections.
create table if not exists network_people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text,
  phone text,
  email text,
  company text,
  title text,
  -- Exactly one row is the graph's anchor ("Me") -- seeded below, fixed at
  -- the center on screen, and not user-deletable. Every other person is a
  -- normal node reached by one or more edges in network_connections.
  is_root boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists network_connections (
  id uuid primary key default gen_random_uuid(),
  from_person_id uuid not null references network_people(id) on delete cascade,
  to_person_id uuid not null references network_people(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint network_connections_no_self_link check (from_person_id <> to_person_id),
  constraint network_connections_unique_edge unique (from_person_id, to_person_id)
);

create index if not exists idx_network_connections_from on network_connections(from_person_id);
create index if not exists idx_network_connections_to on network_connections(to_person_id);

insert into network_people (name, is_root)
  select 'Me', true
  where not exists (select 1 from network_people where is_root);

create table if not exists saved_quotes (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  author text,
  source text,
  created_at timestamptz not null default now()
);

create index if not exists idx_saved_quotes_created_at on saved_quotes(created_at desc);

grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
