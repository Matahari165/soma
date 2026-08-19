-- Make multi-table workout and confirmed Coach actions all-or-nothing.

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

create or replace function public.execute_soma_proposal(
  p_user_id uuid,
  p_proposal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.agent_action_proposals%rowtype;
  v_program_id uuid;
  v_exercises jsonb;
  v_layout jsonb;
  v_widgets jsonb;
  v_widget_id text;
  v_visible boolean;
  v_goal public.fitness_goal_type;
  v_target integer;
  v_receipt jsonb;
begin
  select * into v_proposal
  from public.agent_action_proposals
  where id = p_proposal_id
    and user_id = p_user_id
    and status = 'proposed'
  for update;

  if not found then
    raise exception 'Proposal unavailable' using errcode = 'P0002';
  end if;

  if v_proposal.tool_name = 'create_workout_program' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'exerciseId', match.id,
          'sets', 3,
          'repsMin', 8,
          'repsMax', 12,
          'restSeconds', 90
        ) order by requested.ordinality
      ),
      '[]'::jsonb
    )
    into v_exercises
    from jsonb_array_elements_text(coalesce(v_proposal.arguments -> 'exerciseNames', '[]'::jsonb))
      with ordinality as requested(name, ordinality)
    join lateral (
      select library.id
      from public.exercise_library as library
      where lower(library.name) = lower(requested.name)
        and (library.owner_user_id is null or library.owner_user_id = p_user_id)
      order by library.owner_user_id nulls first
      limit 1
    ) as match on true;

    if jsonb_array_length(v_exercises) = 0
      or jsonb_array_length(v_exercises) <> jsonb_array_length(coalesce(v_proposal.arguments -> 'exerciseNames', '[]'::jsonb)) then
      raise exception 'One or more requested exercises were not found' using errcode = '22023';
    end if;

    v_program_id := public.create_soma_workout_program(
      p_user_id,
      coalesce(nullif(v_proposal.arguments ->> 'programName', ''), 'Coach program'),
      null,
      v_exercises
    );
    v_receipt := jsonb_build_object('executed', true, 'programId', v_program_id);

  elsif v_proposal.tool_name = 'update_sleep_target' then
    v_target := (v_proposal.arguments ->> 'sleepTargetMinutes')::integer;
    if v_target < 240 or v_target > 720 then
      raise exception 'Sleep target is invalid' using errcode = '22023';
    end if;
    update public.sleep_preferences
    set base_target_minutes = v_target
    where user_id = p_user_id;
    if not found then raise exception 'Sleep preferences not found' using errcode = 'P0002'; end if;
    v_receipt := jsonb_build_object('executed', true, 'sleepTargetMinutes', v_target);

  elsif v_proposal.tool_name = 'update_primary_goal' then
    v_goal := (v_proposal.arguments ->> 'goal')::public.fitness_goal_type;
    update public.health_goals
    set ended_on = current_date
    where user_id = p_user_id and priority = 1 and ended_on is null;
    insert into public.health_goals (user_id, goal_type, priority)
    values (p_user_id, v_goal, 1);
    v_receipt := jsonb_build_object('executed', true, 'goal', v_goal);

  elsif v_proposal.tool_name = 'customize_dashboard' then
    v_widget_id := v_proposal.arguments ->> 'widgetId';
    v_visible := (v_proposal.arguments ->> 'visible')::boolean;
    select layout into v_layout
    from public.dashboard_layouts
    where user_id = p_user_id
    for update;
    if not found then raise exception 'Dashboard layout not found' using errcode = 'P0002'; end if;

    select jsonb_agg(
      case when widget ->> 'id' = v_widget_id
        then jsonb_set(widget, '{visible}', to_jsonb(v_visible), false)
        else widget
      end
    )
    into v_widgets
    from jsonb_array_elements(coalesce(v_layout -> 'widgets', '[]'::jsonb)) as widget;

    if not exists (
      select 1 from jsonb_array_elements(coalesce(v_layout -> 'widgets', '[]'::jsonb)) as widget
      where widget ->> 'id' = v_widget_id
    ) then
      raise exception 'Dashboard widget not found' using errcode = 'P0002';
    end if;

    update public.dashboard_layouts
    set layout = jsonb_set(v_layout, '{widgets}', v_widgets, false)
    where user_id = p_user_id;
    v_receipt := jsonb_build_object('executed', true, 'widgetId', v_widget_id, 'visible', v_visible);
  else
    raise exception 'Unsupported action type' using errcode = '22023';
  end if;

  v_receipt := v_receipt || jsonb_build_object('at', now());
  update public.agent_action_proposals
  set status = 'executed',
      confirmed_at = now(),
      executed_at = now(),
      receipt = v_receipt
  where id = p_proposal_id and user_id = p_user_id;

  return v_receipt;
end;
$$;

create or replace function public.persist_soma_coach_exchange(
  p_user_id uuid,
  p_thread_id uuid,
  p_title text,
  p_user_message text,
  p_assistant_message text,
  p_evidence jsonb,
  p_model text,
  p_action_tool_name text,
  p_action_arguments jsonb,
  p_action_preview text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread_id uuid := p_thread_id;
  v_assistant_id uuid;
  v_proposal_id uuid;
begin
  if v_thread_id is null then
    insert into public.coach_threads (user_id, title)
    values (p_user_id, left(p_title, 120))
    returning id into v_thread_id;
  else
    perform 1
    from public.coach_threads
    where id = v_thread_id and user_id = p_user_id
    for update;
    if not found then
      raise exception 'Conversation not found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.coach_messages (user_id, thread_id, role, content)
  values (p_user_id, v_thread_id, 'user', p_user_message);

  insert into public.coach_messages (
    user_id, thread_id, role, content, evidence_refs, model
  )
  values (
    p_user_id, v_thread_id, 'assistant', p_assistant_message,
    coalesce(p_evidence, '[]'::jsonb), p_model
  )
  returning id into v_assistant_id;

  if p_action_tool_name is not null then
    insert into public.agent_action_proposals (
      user_id, thread_id, tool_name, arguments, preview, status, idempotency_key
    )
    values (
      p_user_id,
      v_thread_id,
      p_action_tool_name,
      coalesce(p_action_arguments, '{}'::jsonb),
      p_action_preview,
      'proposed',
      encode(digest(p_user_id::text || ':' || v_thread_id::text || ':' || v_assistant_id::text || ':' || p_action_tool_name, 'sha256'), 'hex')
    )
    returning id into v_proposal_id;
  end if;

  update public.coach_threads
  set updated_at = now()
  where id = v_thread_id and user_id = p_user_id;

  return jsonb_build_object('threadId', v_thread_id, 'proposalId', v_proposal_id);
end;
$$;

revoke all on function public.create_soma_workout_program(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.start_soma_workout_session(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.execute_soma_proposal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.persist_soma_coach_exchange(uuid, uuid, text, text, text, jsonb, text, text, jsonb, text) from public, anon, authenticated;

grant execute on function public.create_soma_workout_program(uuid, text, text, jsonb) to service_role;
grant execute on function public.start_soma_workout_session(uuid, uuid, text) to service_role;
grant execute on function public.execute_soma_proposal(uuid, uuid) to service_role;
grant execute on function public.persist_soma_coach_exchange(uuid, uuid, text, text, text, jsonb, text, text, jsonb, text) to service_role;
