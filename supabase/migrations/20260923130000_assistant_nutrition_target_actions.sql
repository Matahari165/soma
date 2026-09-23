-- A confirmed chat edit updates the same targets row used by the meal interface.
alter table public.assistant_actions drop constraint assistant_actions_action_type_check;
alter table public.assistant_actions add constraint assistant_actions_action_type_check
  check (action_type in ('meal.create', 'nutrition_targets.update', 'goal_set.confirm',
    'goal.update', 'plan_version.confirm', 'memory.confirm', 'memory.reject'));

create or replace function public.confirm_assistant_nutrition_targets(
  p_user_id text,
  p_action_id uuid,
  p_confirmation_message_id uuid,
  p_row_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.assistant_actions;
  v_row public.soma_rows;
  v_after jsonb;
  v_before_raw jsonb;
  v_has_row boolean := false;
  v_now timestamptz := now();
begin
  if not exists (
    select 1 from public.assistant_messages
    where id = p_confirmation_message_id and user_id = p_user_id and role = 'user'
  ) then raise exception 'Confirmation message not found' using errcode = '23503'; end if;

  -- Serialize assistant confirmations, and lock the target row against the
  -- ordinary meal-page upsert. The row comparison prevents lost updates.
  perform 1 from public.soma_users where id = p_user_id for update;
  if not found then raise exception 'User not found' using errcode = 'P0002'; end if;
  select * into v_action from public.assistant_actions
    where id = p_action_id and user_id = p_user_id and action_type = 'nutrition_targets.update'
    for update;
  if not found then raise exception 'Nutrition proposal not found' using errcode = 'P0002'; end if;

  v_after := v_action.payload->'after';
  if jsonb_typeof(v_after) <> 'object' then
    raise exception 'Invalid nutrition proposal' using errcode = '22023';
  end if;
  select * into v_row from public.soma_rows
    where table_name = 'nutrition_targets' and row_key = p_row_key and user_id = p_user_id
    for update;
  v_has_row := found;

  if v_action.state = 'executed' and v_action.confirmation_message_id = p_confirmation_message_id then
    return jsonb_build_object(
      'actionId', v_action.id, 'replayed', true,
      'saved', coalesce(v_row.json_data->'targets' = v_after, false),
      'targets', v_row.json_data->'targets'
    );
  end if;
  if v_action.state <> 'proposed' then
    raise exception 'Nutrition proposal is no longer confirmable' using errcode = '40001';
  end if;
  if exists (
    select 1 from public.assistant_actions newer
    where newer.user_id = p_user_id and newer.action_type = 'nutrition_targets.update'
      and newer.state = 'proposed'
      and (newer.created_at, newer.id) > (v_action.created_at, v_action.id)
  ) then raise exception 'A newer nutrition proposal exists' using errcode = '40001'; end if;

  if coalesce((v_action.payload->>'persisted')::boolean, false) <> v_has_row then
    raise exception 'Nutrition targets changed since proposal' using errcode = '40001';
  end if;
  if v_has_row then
    v_before_raw := coalesce(v_action.payload->'rawBefore', v_action.payload->'before');
    if v_row.json_data->'targets' is distinct from v_before_raw
       and v_row.json_data->'targets' is distinct from v_after then
      raise exception 'Nutrition targets changed since proposal' using errcode = '40001';
    end if;
    if v_row.json_data->'targets' is distinct from v_after then
      update public.soma_rows set
        json_data = jsonb_set(jsonb_set(json_data, '{targets}', v_after), '{updated_at}', to_jsonb(v_now::text)),
        updated_at = v_now
      where table_name = 'nutrition_targets' and row_key = p_row_key;
    end if;
  else
    insert into public.soma_rows (table_name, row_key, user_id, json_data, created_at, updated_at)
      values ('nutrition_targets', p_row_key, p_user_id,
        jsonb_build_object('user_id', p_user_id, 'targets', v_after,
          'created_at', v_now, 'updated_at', v_now), v_now, v_now)
      on conflict do nothing;
    if not found then raise exception 'Nutrition targets changed since proposal' using errcode = '40001'; end if;
  end if;

  update public.assistant_actions set state = 'executed',
    confirmation_message_id = p_confirmation_message_id,
    confirmed_at = v_now, executed_at = v_now
    where id = p_action_id and user_id = p_user_id and state = 'proposed';
  return jsonb_build_object('actionId', p_action_id, 'saved', true, 'targets', v_after, 'replayed', false);
end;
$$;

revoke all on function public.confirm_assistant_nutrition_targets(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_assistant_nutrition_targets(text, uuid, uuid, text) to service_role;
