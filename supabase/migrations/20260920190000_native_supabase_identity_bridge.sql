alter table public.soma_users
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists soma_users_auth_user_id_idx
  on public.soma_users(auth_user_id)
  where auth_user_id is not null;

create table if not exists public.soma_auth_identities (
  provider text not null,
  provider_subject text not null,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  soma_user_id text not null references public.soma_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, provider_subject),
  unique (auth_user_id),
  unique (soma_user_id, provider)
);

alter table public.soma_auth_identities enable row level security;

revoke all on table public.soma_auth_identities from public, anon, authenticated;
grant all on table public.soma_auth_identities to service_role;

comment on table public.soma_auth_identities is
  'Server-only mapping between verified external identities, Supabase Auth users, and legacy Soma users. Never match identities by email.';

create or replace function public.link_native_google_identity(
  p_auth_user_id uuid,
  p_google_subject text,
  p_email text,
  p_display_name text,
  p_avatar_url text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_soma_user_id text;
  v_linked_auth_user_id uuid;
  v_mapped_auth_user_id uuid;
  v_mapped_soma_user_id text;
  v_now timestamptz := now();
begin
  if p_auth_user_id is null or p_google_subject is null or length(trim(p_google_subject)) = 0
     or length(p_google_subject) > 255 then
    raise exception 'Invalid verified Google identity';
  end if;

  -- Serialize exchanges for the same verified Google subject.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('soma-google:' || p_google_subject));

  select id, auth_user_id into v_soma_user_id, v_linked_auth_user_id
  from public.soma_users where google_subject = p_google_subject for update;

  if v_soma_user_id is null then
    v_soma_user_id := p_auth_user_id::text;
    insert into public.soma_users
      (id, google_subject, email, display_name, avatar_url, auth_user_id, created_at, updated_at)
    values
      (v_soma_user_id, p_google_subject, p_email,
       coalesce(nullif(trim(p_display_name), ''), nullif(split_part(p_email, '@', 1), ''), 'Soma user'),
       p_avatar_url, p_auth_user_id, v_now, v_now);
  elsif v_linked_auth_user_id is not null and v_linked_auth_user_id <> p_auth_user_id then
    raise exception 'Google identity is linked to a different authentication account';
  else
    update public.soma_users set
      auth_user_id = p_auth_user_id,
      email = p_email,
      display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
      avatar_url = p_avatar_url,
      updated_at = v_now
    where id = v_soma_user_id;
  end if;

  select auth_user_id, soma_user_id into v_mapped_auth_user_id, v_mapped_soma_user_id
  from public.soma_auth_identities
  where provider = 'google' and provider_subject = p_google_subject for update;

  if v_mapped_auth_user_id is not null then
    if v_mapped_auth_user_id <> p_auth_user_id or v_mapped_soma_user_id <> v_soma_user_id then
      raise exception 'Google identity mapping conflicts with the existing account';
    end if;
  else
    insert into public.soma_auth_identities
      (provider, provider_subject, auth_user_id, soma_user_id, created_at, updated_at)
    values ('google', p_google_subject, p_auth_user_id, v_soma_user_id, v_now, v_now);
  end if;

  return v_soma_user_id;
end;
$$;

revoke all on function public.link_native_google_identity(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.link_native_google_identity(uuid, text, text, text, text) to service_role;
