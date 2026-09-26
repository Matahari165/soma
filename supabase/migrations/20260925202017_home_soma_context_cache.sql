-- Private, bounded generation cache for the contextual home assistant preview.
create table public.home_soma_insights (
  user_id text not null references public.soma_users(id) on delete cascade,
  local_date date not null,
  slot text not null check (slot in ('morning', 'day', 'evening', 'activity')),
  source_hash text not null,
  status text not null check (status in ('pending', 'ready', 'failed')),
  insight_text text check (insight_text is null or char_length(insight_text) <= 360),
  generation_count integer not null default 1 check (generation_count between 1 and 5),
  claimed_at timestamptz not null default now(),
  generated_at timestamptz,
  primary key (user_id, local_date, slot)
);

alter table public.home_soma_insights enable row level security;
revoke all on public.home_soma_insights from anon, authenticated;
grant select, insert, update on public.home_soma_insights to service_role;

create or replace function public.claim_home_soma_insight(
  p_user_id text, p_local_date date, p_slot text, p_source_hash text
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  existing public.home_soma_insights%rowtype;
  daily_calls integer;
begin
  if p_slot not in ('morning', 'day', 'evening', 'activity') or length(p_source_hash) != 64 then
    raise exception 'Invalid home insight claim';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id || ':' || p_local_date::text, 0));
  select * into existing from public.home_soma_insights
    where user_id = p_user_id and local_date = p_local_date and slot = p_slot for update;
  if found and existing.source_hash = p_source_hash and existing.status = 'ready' then
    return jsonb_build_object('claimed', false, 'text', existing.insight_text, 'generatedAt', existing.generated_at);
  end if;
  if found and existing.status = 'pending' and existing.claimed_at > now() - interval '2 minutes' then
    return jsonb_build_object('claimed', false, 'text', existing.insight_text, 'pending', true);
  end if;
  if found and existing.generated_at > now() - interval '45 minutes' then
    return jsonb_build_object('claimed', false, 'text', existing.insight_text, 'generatedAt', existing.generated_at);
  end if;
  select coalesce(sum(generation_count), 0) into daily_calls from public.home_soma_insights
    where user_id = p_user_id and local_date = p_local_date;
  if daily_calls >= 5 then
    return jsonb_build_object('claimed', false, 'text', existing.insight_text, 'limitReached', true);
  end if;
  insert into public.home_soma_insights (user_id, local_date, slot, source_hash, status)
    values (p_user_id, p_local_date, p_slot, p_source_hash, 'pending')
    on conflict (user_id, local_date, slot) do update set
      source_hash = excluded.source_hash,
      status = 'pending',
      claimed_at = now(),
      generation_count = home_soma_insights.generation_count + 1;
  return jsonb_build_object('claimed', true);
end;
$$;

revoke all on function public.claim_home_soma_insight(text, date, text, text) from public, anon, authenticated;
grant execute on function public.claim_home_soma_insight(text, date, text, text) to service_role;
