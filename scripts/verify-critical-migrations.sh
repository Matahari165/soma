#!/usr/bin/env bash
set -euo pipefail

# Run only against the disposable CI database, never against live data.
case "${SOMA_MIGRATION_SMOKE_DATABASE_URL:-}" in
  */soma_migration_smoke) ;;
  *) echo "Set SOMA_MIGRATION_SMOKE_DATABASE_URL to a disposable soma_migration_smoke database." >&2; exit 1 ;;
esac

psql "$SOMA_MIGRATION_SMOKE_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role;
  end if;
end;
$$;
create table public.soma_users (id text primary key);
create table public.soma_rows (
  table_name text not null, row_key text not null, user_id text,
  json_data jsonb not null, created_at timestamptz, updated_at timestamptz,
  primary key (table_name, row_key)
);
insert into public.soma_users(id) values ('synthetic-user');
SQL

psql "$SOMA_MIGRATION_SMOKE_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260923120000_atomic_lab_matrix_revision.sql \
  -f supabase/migrations/20260923121000_auth_attempt_limits.sql

psql "$SOMA_MIGRATION_SMOKE_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
insert into public.soma_rows(table_name, row_key, user_id, json_data)
values ('meals', 'synthetic-meal', 'synthetic-user', '{}');
do $$
begin
  if (select count(*) from public.soma_lab_matrix_revisions where user_id = 'synthetic-user') <> 1 then
    raise exception 'Analytical write did not invalidate the matrix';
  end if;
  if public.consume_soma_auth_attempt('synthetic-key', 1000, 900000) <> 1
    or public.consume_soma_auth_attempt('synthetic-key', 1001, 900000) <> 2
    or public.consume_soma_auth_attempt('synthetic-key', 901001, 900000) <> 1 then
    raise exception 'Auth attempt window is not atomic or does not expire';
  end if;
end;
$$;
SQL
