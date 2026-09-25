-- A verified Supabase email link may reset one matching Soma password once.
-- Soma's user ID is preserved; existing web sessions are revoked atomically.
create table if not exists public.soma_password_reset_redemptions (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id text not null references public.soma_users(id) on delete cascade,
  redeemed_at timestamptz not null default now()
);

create index if not exists soma_password_reset_redemptions_user_idx
  on public.soma_password_reset_redemptions(user_id);

alter table public.soma_password_reset_redemptions enable row level security;
revoke all on public.soma_password_reset_redemptions from public, anon, authenticated;
grant select, insert on public.soma_password_reset_redemptions to service_role;

create or replace function public.complete_soma_password_recovery(
  p_auth_user_id uuid,
  p_token_hash text,
  p_password_hash text,
  p_salt text
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text;
  v_user_id text;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$'
     or p_password_hash !~ '^[0-9a-f]{64}$'
     or p_salt !~ '^[0-9a-f]{32}$' then
    return false;
  end if;

  select lower(btrim(email)) into v_email
  from auth.users
  where id = p_auth_user_id and email_confirmed_at is not null;
  if v_email is null then return false; end if;

  select c.user_id into v_user_id
  from public.soma_credentials c
  join public.soma_users u on u.id = c.user_id
  where c.email = v_email and lower(btrim(u.email)) = v_email
  for update of c;
  if v_user_id is null then return false; end if;

  -- Never take over a Soma account linked to another Supabase identity.
  if exists (select 1 from public.soma_users where auth_user_id = p_auth_user_id and id <> v_user_id)
     or exists (select 1 from public.soma_users where id = v_user_id and auth_user_id is not null and auth_user_id <> p_auth_user_id) then
    return false;
  end if;

  insert into public.soma_password_reset_redemptions(token_hash, user_id)
  values (p_token_hash, v_user_id)
  on conflict do nothing;
  if not found then return false; end if;

  update public.soma_credentials
  set password_hash = p_password_hash, salt = p_salt, updated_at = now()
  where user_id = v_user_id;
  delete from public.soma_sessions where user_id = v_user_id;
  return true;
end;
$$;

revoke all on function public.complete_soma_password_recovery(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_soma_password_recovery(uuid, text, text, text)
  to service_role;
