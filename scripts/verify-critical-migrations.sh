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
create schema auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
create table public.soma_users (id text primary key, email text, auth_user_id uuid);
create table public.soma_credentials (
  user_id text primary key references public.soma_users(id),
  email text not null unique,
  password_hash text not null,
  salt text not null,
  updated_at timestamptz not null
);
create table public.soma_sessions (token_hash text primary key, user_id text not null references public.soma_users(id));
create table public.soma_rows (
  table_name text not null, row_key text not null, user_id text,
  json_data jsonb not null, created_at timestamptz, updated_at timestamptz,
  primary key (table_name, row_key)
);
insert into public.soma_users(id, email) values ('synthetic-user', 'synthetic@example.invalid');
insert into public.soma_credentials(user_id, email, password_hash, salt, updated_at)
values ('synthetic-user', 'synthetic@example.invalid', repeat('a', 64), repeat('b', 32), now());
insert into public.soma_sessions(token_hash, user_id) values ('synthetic-session', 'synthetic-user');
insert into auth.users(id, email, email_confirmed_at)
values ('00000000-0000-4000-8000-000000000001', 'synthetic@example.invalid', now());
SQL

psql "$SOMA_MIGRATION_SMOKE_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260923120000_atomic_lab_matrix_revision.sql \
  -f supabase/migrations/20260923121000_auth_attempt_limits.sql \
  -f supabase/migrations/20260925113516_email_password_recovery.sql \
  -f supabase/migrations/20260925202017_home_soma_context_cache.sql

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
  if not public.complete_soma_password_recovery(
    '00000000-0000-4000-8000-000000000001', repeat('c', 64), repeat('d', 64), repeat('e', 32)
  ) then
    raise exception 'Verified email could not reset its matching Soma password';
  end if;
  if public.complete_soma_password_recovery(
    '00000000-0000-4000-8000-000000000001', repeat('c', 64), repeat('f', 64), repeat('e', 32)
  ) then
    raise exception 'Password recovery token was reusable';
  end if;
  if (select password_hash from public.soma_credentials where user_id = 'synthetic-user') <> repeat('d', 64)
    or exists (select 1 from public.soma_sessions where user_id = 'synthetic-user') then
    raise exception 'Password or sessions were not updated atomically';
  end if;
  if has_function_privilege('anon', 'public.complete_soma_password_recovery(uuid,text,text,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.complete_soma_password_recovery(uuid,text,text,text)', 'EXECUTE') then
    raise exception 'Recovery RPC is exposed to a client role';
  end if;
  if not (public.claim_home_soma_insight('synthetic-user', current_date, 'morning', repeat('a', 64))->>'claimed')::boolean then
    raise exception 'First home insight generation was not claimed';
  end if;
  if (public.claim_home_soma_insight('synthetic-user', current_date, 'morning', repeat('a', 64))->>'claimed')::boolean then
    raise exception 'Concurrent home insight generation was not blocked';
  end if;
  update public.home_soma_insights set status = 'ready', insight_text = 'Synthetic cached insight', generated_at = now()
    where user_id = 'synthetic-user';
  if public.claim_home_soma_insight('synthetic-user', current_date, 'morning', repeat('a', 64))->>'text' <> 'Synthetic cached insight'
    or (public.claim_home_soma_insight('synthetic-user', current_date, 'morning', repeat('b', 64))->>'claimed')::boolean then
    raise exception 'Home insight cache or cooldown failed';
  end if;
  for i in 2..5 loop
    update public.home_soma_insights set claimed_at = now() - interval '3 minutes', generated_at = now() - interval '46 minutes'
      where user_id = 'synthetic-user';
    if not (public.claim_home_soma_insight('synthetic-user', current_date, 'morning', repeat(i::text, 64))->>'claimed')::boolean then
      raise exception 'Home insight claim below daily limit failed';
    end if;
  end loop;
  update public.home_soma_insights set claimed_at = now() - interval '3 minutes', generated_at = now() - interval '46 minutes'
    where user_id = 'synthetic-user';
  if (public.claim_home_soma_insight('synthetic-user', current_date, 'day', repeat('f', 64))->>'claimed')::boolean then
    raise exception 'Home insight daily generation limit failed';
  end if;
  if has_table_privilege('anon', 'public.home_soma_insights', 'SELECT')
    or has_table_privilege('authenticated', 'public.home_soma_insights', 'SELECT')
    or has_function_privilege('anon', 'public.claim_home_soma_insight(text,date,text,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.claim_home_soma_insight(text,date,text,text)', 'EXECUTE') then
    raise exception 'Home insight cache is exposed to a client role';
  end if;
end;
$$;
SQL
