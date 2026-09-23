create table if not exists public.soma_auth_attempts (
  key text primary key,
  attempts integer not null,
  expires_at_ms bigint not null
);

create index if not exists soma_auth_attempts_expiry_idx on public.soma_auth_attempts(expires_at_ms);
alter table public.soma_auth_attempts enable row level security;
grant select, insert, update, delete on public.soma_auth_attempts to service_role;

create or replace function public.consume_soma_auth_attempt(
  p_key text,
  p_now_ms bigint,
  p_window_ms bigint
) returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_attempts integer;
begin
  insert into public.soma_auth_attempts as attempts(key, attempts, expires_at_ms)
  values (p_key, 1, p_now_ms + p_window_ms)
  on conflict (key) do update set
    attempts = case when attempts.expires_at_ms <= p_now_ms then 1 else attempts.attempts + 1 end,
    expires_at_ms = case when attempts.expires_at_ms <= p_now_ms then p_now_ms + p_window_ms else attempts.expires_at_ms end
  returning attempts into v_attempts;

  if random() < 0.01 then
    delete from public.soma_auth_attempts where expires_at_ms < p_now_ms - 86400000;
  end if;
  return v_attempts;
end;
$$;

revoke all on function public.consume_soma_auth_attempt(text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.consume_soma_auth_attempt(text, bigint, bigint) to service_role;
