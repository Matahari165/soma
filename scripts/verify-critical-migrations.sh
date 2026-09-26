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
  -f supabase/migrations/20260925202017_home_soma_context_cache.sql \
  -f supabase/migrations/20260926154547_strict_home_soma_insight_budget.sql

psql "$SOMA_MIGRATION_SMOKE_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
insert into public.soma_rows(table_name, row_key, user_id, json_data)
values ('meals', 'synthetic-meal', 'synthetic-user', '{}');
insert into public.soma_users(id, email)
values
  ('synthetic-cache-user', 'cache@example.invalid'),
  ('synthetic-legacy-user', 'legacy@example.invalid');
do $$
declare
  claim jsonb;
  attempt_count integer;
  row_count integer;
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
  -- The disabled daytime slot is rejected even on an otherwise empty day.
  claim := public.claim_home_soma_insight('synthetic-user', current_date, 'day', repeat('f', 64));
  if claim->>'claimed' <> 'false' or claim->>'limitReached' <> 'true'
    or claim->>'budgetSpent' <> 'false'
    or exists (select 1 from public.home_soma_insights where user_id = 'synthetic-user') then
    raise exception 'Disabled daytime slot claimed budget or inserted a row';
  end if;

  if not (public.claim_home_soma_insight('synthetic-user', current_date, 'morning', repeat('a', 64))->>'claimed')::boolean then
    raise exception 'First home insight generation was not claimed';
  end if;
  claim := public.claim_home_soma_insight('synthetic-user', current_date, 'morning', repeat('b', 64));
  if claim->>'claimed' <> 'false' or claim->>'pending' <> 'true' then
    raise exception 'Changed source hash reused a pending home insight slot';
  end if;
  update public.home_soma_insights
    set status = 'failed', insight_text = 'Synthetic fallback',
        claimed_at = now() - interval '46 minutes', generated_at = now() - interval '46 minutes'
    where user_id = 'synthetic-user' and slot = 'morning';
  claim := public.claim_home_soma_insight('synthetic-user', current_date, 'morning', repeat('c', 64));
  if claim->>'claimed' <> 'false' or claim->>'pending' <> 'false'
    or claim->>'limitReached' <> 'true' or claim->>'budgetSpent' <> 'true'
    or claim->>'text' <> 'Synthetic fallback' or claim->>'generatedAt' is null then
    raise exception 'Failed slot was reusable after 45 minutes or lost its cached metadata';
  end if;
  select generation_count into attempt_count from public.home_soma_insights
    where user_id = 'synthetic-user' and slot = 'morning';
  if attempt_count <> 1 then
    raise exception 'Failed same-slot retry changed generation_count from 1';
  end if;

  if not (public.claim_home_soma_insight('synthetic-user', current_date, 'activity', repeat('d', 64))->>'claimed')::boolean
    or not (public.claim_home_soma_insight('synthetic-user', current_date, 'evening', repeat('e', 64))->>'claimed')::boolean then
    raise exception 'Second and third home insight slots were not claimed';
  end if;
  claim := public.claim_home_soma_insight('synthetic-user', current_date, 'day', repeat('f', 64));
  if claim->>'claimed' <> 'false' then
    raise exception 'Disabled daytime slot was claimable after the daily budget';
  end if;
  select count(*), sum(generation_count) into row_count, attempt_count
    from public.home_soma_insights where user_id = 'synthetic-user' and local_date = current_date;
  if row_count <> 3 or attempt_count <> 3 then
    raise exception 'Expected exactly three daily slot attempts, got % rows and % attempts', row_count, attempt_count;
  end if;

  if not (public.claim_home_soma_insight('synthetic-cache-user', current_date, 'morning', repeat('1', 64))->>'claimed')::boolean then
    raise exception 'Cache metadata fixture claim failed';
  end if;
  update public.home_soma_insights set status = 'ready', insight_text = 'Synthetic cached insight', generated_at = now()
    where user_id = 'synthetic-cache-user';
  claim := public.claim_home_soma_insight('synthetic-cache-user', current_date, 'morning', repeat('1', 64));
  if claim->>'claimed' <> 'false' or claim->>'text' <> 'Synthetic cached insight'
    or claim->>'generatedAt' is null or claim->>'pending' <> 'false' then
    raise exception 'Ready cache metadata was not preserved';
  end if;

  insert into public.home_soma_insights
    (user_id, local_date, slot, source_hash, status, generation_count, claimed_at, generated_at)
  values ('synthetic-legacy-user', current_date, 'morning', repeat('2', 64), 'failed', 3,
    now() - interval '1 day', now() - interval '1 day');
  claim := public.claim_home_soma_insight('synthetic-legacy-user', current_date, 'activity', repeat('3', 64));
  if claim->>'claimed' <> 'false' or claim->>'limitReached' <> 'true'
    or claim->>'budgetSpent' <> 'true'
    or exists (select 1 from public.home_soma_insights where user_id = 'synthetic-legacy-user' and slot = 'activity') then
    raise exception 'Legacy generation_count of three did not exhaust the daily budget';
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
