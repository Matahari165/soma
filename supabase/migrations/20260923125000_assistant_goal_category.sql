-- The confirmed assistant goal set is the canonical objective. This category is
-- a narrow projection for existing nutrition and training calculations.
alter table public.assistant_goal_sets
  add column primary_goal_type text
  check (primary_goal_type is null or primary_goal_type in
    ('build_muscle', 'improve_endurance', 'improve_cardio', 'general_fitness', 'maintain_health', 'other'));

alter table public.assistant_goal_sets
  add column supersedes_goal_set_id uuid
  references public.assistant_goal_sets(id);

alter table public.assistant_plans drop constraint assistant_plans_status_check;
alter table public.assistant_plans add constraint assistant_plans_status_check
  check (status in ('draft', 'active', 'needs_review', 'completed', 'archived'));

create or replace function public.confirm_assistant_goal_set(
  p_user_id text,
  p_goal_set_id uuid,
  p_confirmation_message_id uuid
)
returns public.assistant_goal_sets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_goal_set public.assistant_goal_sets;
  v_current_id uuid;
begin
  if not exists (
    select 1 from public.assistant_messages
    where id = p_confirmation_message_id and user_id = p_user_id and role = 'user'
  ) then raise exception 'Confirmation message not found' using errcode = '23503'; end if;

  -- Serialize confirmations for this user, including their first confirmation.
  perform 1 from public.soma_users where id = p_user_id for update;
  select * into v_goal_set from public.assistant_goal_sets
    where id = p_goal_set_id and user_id = p_user_id;
  if not found then raise exception 'Goal set not found' using errcode = 'P0002'; end if;
  if v_goal_set.status = 'confirmed' then return v_goal_set; end if;
  if v_goal_set.status <> 'draft' then raise exception 'Goal set is no longer confirmable' using errcode = 'P0002'; end if;

  select id into v_current_id from public.assistant_goal_sets
    where user_id = p_user_id and status = 'confirmed';
  if v_current_id is not null and v_goal_set.supersedes_goal_set_id is null then
    raise exception 'A confirmed goal set must be revised, not replaced' using errcode = '40001';
  end if;
  if v_goal_set.supersedes_goal_set_id is not null
     and v_goal_set.supersedes_goal_set_id is distinct from v_current_id then
    raise exception 'Goal revision is stale' using errcode = '40001';
  end if;

  -- A plan built for the old objective is not silently still current.
  update public.assistant_plans set status = 'needs_review', updated_at = now()
    where user_id = p_user_id and goal_set_id is distinct from p_goal_set_id and status = 'active';

  update public.assistant_goal_sets set status = 'archived', updated_at = now()
    where user_id = p_user_id and status = 'confirmed' and id <> p_goal_set_id;
  update public.assistant_goal_sets set
    status = 'confirmed', confirmed_by_message_id = p_confirmation_message_id,
    confirmed_at = now(), updated_at = now()
    where id = p_goal_set_id and user_id = p_user_id and status = 'draft'
    returning * into v_goal_set;
  if not found then raise exception 'Draft goal set not found' using errcode = 'P0002'; end if;
  return v_goal_set;
end;
$$;

revoke all on function public.confirm_assistant_goal_set(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_assistant_goal_set(text, uuid, uuid) to service_role;

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
