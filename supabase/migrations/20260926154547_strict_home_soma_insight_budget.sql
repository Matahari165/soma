-- Enforce a strict one-attempt-per-slot and three-attempt-per-local-day budget.
-- Failed generations remain counted because the claim row is never replaced.
create or replace function public.claim_home_soma_insight(
  p_user_id text, p_local_date date, p_slot text, p_source_hash text
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  existing public.home_soma_insights%rowtype;
  daily_calls integer;
  is_pending boolean;
begin
  if p_slot not in ('morning', 'day', 'evening', 'activity') or length(p_source_hash) != 64 then
    raise exception 'Invalid home insight claim';
  end if;

  -- Serialize all claims for this user and local day before reading either budget.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id || ':' || p_local_date::text, 0));

  select * into existing from public.home_soma_insights
    where user_id = p_user_id and local_date = p_local_date and slot = p_slot for update;
  if found then
    is_pending := existing.status = 'pending'
      and existing.claimed_at > now() - interval '2 minutes';
    return jsonb_build_object(
      'claimed', false,
      'text', existing.insight_text,
      'generatedAt', existing.generated_at,
      'pending', is_pending,
      'limitReached', true,
      'budgetSpent', true
    );
  end if;

  -- The legacy daytime slot is deliberately disabled, even when budget remains.
  if p_slot = 'day' then
    return jsonb_build_object(
      'claimed', false,
      'text', null,
      'pending', false,
      'limitReached', true,
      'budgetSpent', false
    );
  end if;

  -- Include old rows and their historical generation counts in the new cap.
  select coalesce(sum(generation_count), 0) into daily_calls
    from public.home_soma_insights
    where user_id = p_user_id and local_date = p_local_date;
  if daily_calls >= 3 then
    return jsonb_build_object(
      'claimed', false,
      'text', null,
      'pending', false,
      'limitReached', true,
      'budgetSpent', true
    );
  end if;

  -- A slot is inserted exactly once. In particular, failures and changed source
  -- hashes never update generation_count or make that slot claimable again.
  insert into public.home_soma_insights (user_id, local_date, slot, source_hash, status)
    values (p_user_id, p_local_date, p_slot, p_source_hash, 'pending');

  return jsonb_build_object('claimed', true);
end;
$$;

revoke all on function public.claim_home_soma_insight(text, date, text, text) from public, anon, authenticated;
grant execute on function public.claim_home_soma_insight(text, date, text, text) to service_role;
