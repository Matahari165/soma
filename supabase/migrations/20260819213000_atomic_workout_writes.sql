-- Make multi-table workout writes all-or-nothing.

create or replace function public.create_soma_workout_program(
  p_user_id uuid,
  p_name text,
  p_description text,
  p_exercises jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program_id uuid;
  v_inserted integer;
begin
  if jsonb_typeof(p_exercises) <> 'array' or jsonb_array_length(p_exercises) = 0 then
    raise exception 'Program exercises are required' using errcode = '22023';
  end if;

  insert into public.workout_programs (user_id, name, description)
  values (p_user_id, p_name, p_description)
  returning id into v_program_id;

  insert into public.workout_program_exercises (
    user_id, program_id, exercise_id, position,
    target_sets, target_reps_min, target_reps_max, rest_seconds
  )
  select
    p_user_id,
    v_program_id,
    library.id,
    (requested.ordinality - 1)::smallint,
    (requested.value ->> 'sets')::smallint,
    (requested.value ->> 'repsMin')::smallint,
    (requested.value ->> 'repsMax')::smallint,
    (requested.value ->> 'restSeconds')::integer
  from jsonb_array_elements(p_exercises) with ordinality as requested(value, ordinality)
  join public.exercise_library as library
    on library.id = (requested.value ->> 'exerciseId')::uuid
   and (library.owner_user_id is null or library.owner_user_id = p_user_id);

  get diagnostics v_inserted = row_count;
  if v_inserted <> jsonb_array_length(p_exercises) then
    raise exception 'One or more exercises are unavailable' using errcode = '22023';
  end if;

  return v_program_id;
end;
$$;

create or replace function public.start_soma_workout_session(
  p_user_id uuid,
  p_program_id uuid,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_inserted integer;
begin
  if not exists (
    select 1 from public.workout_programs
    where id = p_program_id and user_id = p_user_id and active
  ) then
    raise exception 'Program not found' using errcode = 'P0002';
  end if;

  insert into public.workout_sessions (user_id, program_id, name, status, started_at)
  values (p_user_id, p_program_id, p_name, 'active', now())
  returning id into v_session_id;

  insert into public.workout_session_sets (
    user_id, session_id, exercise_id, exercise_position,
    set_index, target_reps, rest_seconds
  )
  select
    p_user_id,
    v_session_id,
    exercise.exercise_id,
    exercise.position,
    generated.set_index,
    exercise.target_reps_min,
    exercise.rest_seconds
  from public.workout_program_exercises as exercise
  cross join lateral generate_series(1, exercise.target_sets) as generated(set_index)
  where exercise.program_id = p_program_id
    and exercise.user_id = p_user_id;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    raise exception 'Program has no sets' using errcode = '22023';
  end if;

  return v_session_id;
end;
$$;

revoke all on function public.create_soma_workout_program(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.start_soma_workout_session(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.create_soma_workout_program(uuid, text, text, jsonb) to service_role;
grant execute on function public.start_soma_workout_session(uuid, uuid, text) to service_role;
