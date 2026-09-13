-- Runtime storage for the Cloudflare-compatible Soma adapter.
--
-- Soma currently stores product rows as lossless JSON records in D1. Keeping
-- the same shape in Postgres makes the first migration reversible: data can
-- be copied without inventing a new schema at the same time as changing the
-- runtime. The application still accesses these tables server-side only.

create table if not exists public.soma_users (
  id text primary key,
  google_subject text not null unique,
  email text,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.soma_sessions (
  token_hash text primary key,
  user_id text not null references public.soma_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null
);

create index if not exists soma_sessions_user_idx on public.soma_sessions(user_id);
create index if not exists soma_sessions_expiry_idx on public.soma_sessions(expires_at);

create table if not exists public.soma_rows (
  table_name text not null,
  row_key text not null,
  user_id text,
  json_data jsonb not null,
  created_at timestamptz,
  updated_at timestamptz,
  primary key (table_name, row_key)
);

create index if not exists soma_rows_table_user_idx
  on public.soma_rows(table_name, user_id);
create index if not exists soma_rows_user_idx
  on public.soma_rows(user_id);
create index if not exists soma_rows_updated_idx
  on public.soma_rows(table_name, updated_at);

alter table public.soma_users enable row level security;
alter table public.soma_sessions enable row level security;
alter table public.soma_rows enable row level security;

-- service_role bypasses RLS, but it still needs explicit table privileges when
-- tables are created through the SQL editor.
grant select, insert, update, delete
  on table public.soma_users, public.soma_sessions, public.soma_rows
  to service_role;
