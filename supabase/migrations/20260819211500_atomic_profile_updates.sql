-- Keep profile, sleep preferences, and the primary goal in one transaction.

create or replace function public.update_soma_profile(
  p_user_id uuid,
  p_display_name text,
  p_date_of_birth date,
  p_height_cm numeric,
  p_weight_kg numeric,
  p_import_range public.import_range_type,
  p_base_sleep_target_minutes smallint,
  p_usual_wake_time time,
  p_primary_goal public.fitness_goal_type
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_goal_id uuid;
  v_goal_type public.fitness_goal_type;
  v_row_count integer;
begin
  update public.profiles
  set display_name = p_display_name,
      date_of_birth = p_date_of_birth,
      height_cm = p_height_cm,
      weight_kg = p_weight_kg,
      import_range = p_import_range
  where user_id = p_user_id;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  update public.sleep_preferences
  set base_target_minutes = p_base_sleep_target_minutes,
      usual_wake_time = p_usual_wake_time
  where user_id = p_user_id;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception 'Sleep preferences not found' using errcode = 'P0002';
  end if;

  select id, goal_type
  into v_goal_id, v_goal_type
  from public.health_goals
  where user_id = p_user_id
    and priority = 1
    and ended_on is null
  order by starts_on desc, created_at desc
  limit 1
  for update;

  if v_goal_type is distinct from p_primary_goal then
    if v_goal_id is not null then
      update public.health_goals
      set ended_on = current_date
      where id = v_goal_id
        and user_id = p_user_id;
    end if;

    insert into public.health_goals (user_id, goal_type, priority)
    values (p_user_id, p_primary_goal, 1);
  end if;
end;
$$;

revoke all on function public.update_soma_profile(
  uuid, text, date, numeric, numeric, public.import_range_type, smallint, time, public.fitness_goal_type
) from public, anon, authenticated;

grant execute on function public.update_soma_profile(
  uuid, text, date, numeric, numeric, public.import_range_type, smallint, time, public.fitness_goal_type
) to service_role;

-- Complete onboarding without leaving a partial profile if one write fails.
create or replace function public.complete_soma_onboarding(
  p_user_id uuid,
  p_display_name text,
  p_timezone text,
  p_date_of_birth date,
  p_height_cm numeric,
  p_weight_kg numeric,
  p_sex_for_health_calculations text,
  p_import_range public.import_range_type,
  p_base_sleep_target_minutes smallint,
  p_usual_wake_time time,
  p_primary_goal public.fitness_goal_type,
  p_secondary_goal public.fitness_goal_type default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row_count integer;
begin
  if p_secondary_goal is not null and p_secondary_goal = p_primary_goal then
    raise exception 'Secondary goal must differ from primary goal' using errcode = '22023';
  end if;

  update public.profiles
  set display_name = p_display_name,
      timezone = p_timezone,
      date_of_birth = p_date_of_birth,
      height_cm = p_height_cm,
      weight_kg = p_weight_kg,
      sex_for_health_calculations = p_sex_for_health_calculations,
      onboarding_completed_at = now(),
      import_range = p_import_range
  where user_id = p_user_id;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  update public.sleep_preferences
  set base_target_minutes = p_base_sleep_target_minutes,
      usual_wake_time = p_usual_wake_time
  where user_id = p_user_id;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception 'Sleep preferences not found' using errcode = 'P0002';
  end if;

  update public.health_goals
  set ended_on = current_date
  where user_id = p_user_id
    and ended_on is null;

  insert into public.health_goals (user_id, goal_type, priority)
  values (p_user_id, p_primary_goal, 1);

  if p_secondary_goal is not null then
    insert into public.health_goals (user_id, goal_type, priority)
    values (p_user_id, p_secondary_goal, 2);
  end if;
end;
$$;

revoke all on function public.complete_soma_onboarding(
  uuid, text, text, date, numeric, numeric, text, public.import_range_type, smallint, time,
  public.fitness_goal_type, public.fitness_goal_type
) from public, anon, authenticated;

grant execute on function public.complete_soma_onboarding(
  uuid, text, text, date, numeric, numeric, text, public.import_range_type, smallint, time,
  public.fitness_goal_type, public.fitness_goal_type
) to service_role;
