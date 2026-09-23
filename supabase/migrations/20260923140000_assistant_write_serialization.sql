-- Both the meal interface and the assistant serialize target writes on the
-- same user row. A pending assistant proposal still uses its before-value CAS.
create or replace function public.save_soma_nutrition_targets(
  p_user_id text,
  p_row_key text,
  p_targets jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
begin
  if p_targets is null or jsonb_typeof(p_targets) <> 'object' then
    raise exception 'Invalid nutrition targets' using errcode = '22023';
  end if;
  perform 1 from public.soma_users where id = p_user_id for update;
  if not found then raise exception 'User not found' using errcode = 'P0002'; end if;

  insert into public.soma_rows (table_name, row_key, user_id, json_data, created_at, updated_at)
  values ('nutrition_targets', p_row_key, p_user_id,
    jsonb_build_object('user_id', p_user_id, 'targets', p_targets,
      'created_at', v_now, 'updated_at', v_now), v_now, v_now)
  on conflict (table_name, row_key) do update set
    json_data = jsonb_set(
      jsonb_set(public.soma_rows.json_data, '{targets}', p_targets),
      '{updated_at}', to_jsonb(v_now::text)
    ),
    updated_at = v_now
  where public.soma_rows.user_id = p_user_id;
  if not found then raise exception 'Nutrition row owner mismatch' using errcode = '42501'; end if;
  return p_targets;
end;
$$;

revoke all on function public.save_soma_nutrition_targets(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.save_soma_nutrition_targets(text, text, jsonb) to service_role;

-- Goal and plan confirmations must take the same user-level lock before
-- reading the active goal; otherwise a stale plan can become active again.
create or replace function public.confirm_assistant_plan_version(
  p_user_id text,
  p_plan_version_id uuid,
  p_confirmation_message_id uuid
)
returns public.assistant_plan_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_id uuid;
  v_plan_goal_set_id uuid;
  v_current_goal_set_id uuid;
  v_version public.assistant_plan_versions;
begin
  if not exists (
    select 1 from public.assistant_messages
    where id = p_confirmation_message_id and user_id = p_user_id and role = 'user'
  ) then raise exception 'Confirmation message not found' using errcode = '23503'; end if;

  perform 1 from public.soma_users where id = p_user_id for update;
  if not found then raise exception 'User not found' using errcode = 'P0002'; end if;
  select * into v_version from public.assistant_plan_versions
    where id = p_plan_version_id and user_id = p_user_id and status = 'confirmed';
  if found then return v_version; end if;

  select plan_id into v_plan_id from public.assistant_plan_versions
    where id = p_plan_version_id and user_id = p_user_id and status = 'proposed'
    for update;
  if not found then raise exception 'Proposed plan version not found' using errcode = 'P0002'; end if;

  select goal_set_id into v_plan_goal_set_id from public.assistant_plans
    where id = v_plan_id and user_id = p_user_id;
  select id into v_current_goal_set_id from public.assistant_goal_sets
    where user_id = p_user_id and status = 'confirmed';
  if v_plan_goal_set_id is distinct from v_current_goal_set_id then
    raise exception 'Plan is based on an old goal set' using errcode = '40001';
  end if;

  update public.assistant_plan_versions set status = 'superseded'
    where plan_id = v_plan_id and user_id = p_user_id and status = 'confirmed';
  update public.assistant_plan_versions set
    status = 'confirmed', confirmed_by_message_id = p_confirmation_message_id, confirmed_at = now()
    where id = p_plan_version_id and user_id = p_user_id
    returning * into v_version;
  update public.assistant_plans set status = 'active', updated_at = now()
    where id = v_plan_id and user_id = p_user_id;
  return v_version;
end;
$$;

revoke all on function public.confirm_assistant_plan_version(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_assistant_plan_version(text, uuid, uuid) to service_role;
