-- Server-only read aggregates. Invoker rights retain the storage access model;
-- no function is callable by browser roles or PUBLIC.
create or replace function public.soma_latest_health_records(p_user_id text, p_data_types text[])
returns table(data_type text, civil_date text, measured_at text)
language sql stable security invoker set search_path = '' as $$
  select distinct on (r.json_data->>'data_type')
    r.json_data->>'data_type', r.json_data->>'civil_date', r.json_data->>'measured_at'
  from public.soma_rows r
  where r.table_name = 'health_records' and r.user_id = p_user_id
    and r.json_data->>'data_type' = any(p_data_types)
  order by r.json_data->>'data_type', r.json_data->>'civil_date' desc nulls last,
    r.json_data->>'measured_at' desc nulls last, r.row_key
$$;

create or replace function public.soma_health_sync_diagnostics(p_user_id text, p_data_types text[])
returns jsonb language sql stable security invoker set search_path = '' as $$
  with health as (
    select r.json_data->>'data_type' as data_type, count(*) as records,
      count(r.json_data->>'civil_date') as dated
    from public.soma_rows r where r.table_name = 'health_records' and r.user_id = p_user_id
    group by r.json_data->>'data_type'
  ), analytics as (
    select r.table_name, count(*) as rows from public.soma_rows r
    where r.user_id = p_user_id and r.table_name in ('daily_health_metrics', 'daily_scores')
    group by r.table_name
  )
  select jsonb_build_object(
    'importedRecords', coalesce((select jsonb_object_agg(t, coalesce(h.records, 0))
      from unnest(p_data_types) t left join health h on h.data_type = t), '{}'::jsonb),
    'analytics', jsonb_build_object(
      'datedRecords', coalesce((select sum(dated) from health), 0),
      'metricDays', coalesce((select rows from analytics where table_name = 'daily_health_metrics'), 0),
      'scoreRows', coalesce((select rows from analytics where table_name = 'daily_scores'), 0)))
$$;

-- Same date precedence and wearable windows as domain/health/data-coverage.ts.
-- payload is only inspected in SQL for Whoop attribution; never transferred.
create or replace function public.soma_health_data_coverage(p_user_id text, p_data_types text[])
returns table(status text, "importedDays" bigint, "usedDays" bigint, "importedNights" bigint,
  "usedNights" bigint, "missingDays" bigint, "missingNights" bigint, "startDate" text, "endDate" text)
language sql stable security invoker set search_path = '' as $$
  with profile as (
    select coalesce((select nullif(r.json_data->>'timezone', '') from public.soma_rows r
      where r.table_name = 'profiles' and r.user_id = p_user_id limit 1), 'Europe/Paris') as timezone
  ), records as (
    select r.json_data->>'data_type' as kind,
      coalesce(nullif(r.json_data->>'civil_date', ''),
        to_char(coalesce(r.json_data->>'end_time', r.json_data->>'start_time', r.json_data->>'measured_at')::timestamptz
          at time zone profile.timezone, 'YYYY-MM-DD')) as date,
      coalesce(r.json_data->>'provider' = 'whoop_export', false)
        or lower(trim(coalesce(r.json_data->>'source_device', ''))) = 'whoop' as exported,
      lower(coalesce(r.json_data #>> '{payload,dataSource,application,packageName}', '')) like '%whoop%' as mirrored,
      length(trim(coalesce(r.json_data->>'source_device', ''))) > 0 as attributed
    from public.soma_rows r cross join profile
    where r.table_name = 'health_records' and r.user_id = p_user_id
      and r.json_data->>'data_type' = any(p_data_types)
  ), anchors as (
    select * from records where kind in ('sleep', 'daily-heart-rate-variability', 'daily-resting-heart-rate')
  ), whoop as (
    select min(date) as start from anchors where exported or mirrored
  ), wearable_window as (
    select min(date) as start,
      (select start from whoop) as whoop_start,
      (select min(a.date) from anchors a cross join whoop
        where a.attributed and not (a.exported or a.mirrored)
          and (whoop.start is null or a.date > whoop.start)) as next_start
    from anchors where exported or mirrored or attributed
  ), imported as (
    select distinct r.date, r.kind = 'sleep' as night
    from records r cross join wearable_window w
    where r.date is not null and (
      w.start is null or (r.date >= w.start and case
        when w.next_start is not null and r.date >= w.next_start then not (r.exported or r.mirrored)
        when w.whoop_start is not null and r.date >= w.whoop_start then
          r.kind in ('sleep', 'daily-heart-rate-variability', 'daily-resting-heart-rate',
            'daily-respiratory-rate', 'daily-oxygen-saturation', 'daily-sleep-temperature-derivations',
            'exercise', 'daily-exercise-summary', 'time-in-heart-rate-zone')
          and (r.exported or r.mirrored)
          and not (r.mirrored and exists (select 1 from records e where e.exported and e.date = r.date and e.kind = r.kind))
        else true end))
  ), dates as (
    select date, bool_or(night) as night from imported group by date
  ), used as (
    select r.json_data->>'metric_date' as date,
      bool_or(r.json_data->>'sleep_minutes' is not null) as night
    from public.soma_rows r where r.table_name = 'daily_health_metrics' and r.user_id = p_user_id
    group by r.json_data->>'metric_date'
  ), counts as (
    select count(*) as days, count(u.date) as used_days,
      count(*) filter (where d.night) as nights,
      count(*) filter (where d.night and u.night) as used_nights,
      min(d.date) as start, max(d.date) as finish
    from dates d left join used u on u.date = d.date
  )
  select case when days = 0 then 'empty' when days > used_days or nights > used_nights then 'incomplete' else 'complete' end,
    days, used_days, nights, used_nights, days - used_days, nights - used_nights, start, finish from counts
$$;

revoke all on function public.soma_latest_health_records(text, text[]) from public, anon, authenticated;
revoke all on function public.soma_health_sync_diagnostics(text, text[]) from public, anon, authenticated;
revoke all on function public.soma_health_data_coverage(text, text[]) from public, anon, authenticated;
grant execute on function public.soma_latest_health_records(text, text[]) to service_role;
grant execute on function public.soma_health_sync_diagnostics(text, text[]) to service_role;
grant execute on function public.soma_health_data_coverage(text, text[]) to service_role;

create index if not exists soma_rows_meals_user_date_idx
  on public.soma_rows(user_id, (json_data->>'meal_date') desc, (json_data->>'created_at') desc) where table_name = 'meals';
create index if not exists soma_rows_journal_date_idx
  on public.soma_rows(table_name, user_id, (json_data->>'entry_date')) where table_name in ('journal_entries', 'journal_days');
create index if not exists soma_rows_meal_children_idx
  on public.soma_rows(table_name, (json_data->>'meal_id'), (json_data->>'created_at'))
  where table_name in ('meal_photos', 'meal_analyses', 'meal_feelings');

create index if not exists soma_rows_meal_photos_user_meal_idx
  on public.soma_rows(user_id, (json_data->>'meal_id'), (json_data->>'created_at')) where table_name = 'meal_photos';
create index if not exists soma_rows_failed_meal_cleanup_idx
  on public.soma_rows((json_data->>'failure_started_at'), (json_data->>'completed_at'), (json_data->>'updated_at'), (json_data->>'created_at'))
  where table_name = 'meal_analyses' and json_data->>'status' = 'failed' and json_data->>'photo_purge_completed_at' is null;

-- Nutrition targets determine Light breakfast values and must invalidate cached matrices.
create or replace function public.bump_soma_lab_matrix_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed_table text;
  changed_user text;
begin
  if tg_op = 'DELETE' then
    changed_table := old.table_name;
    changed_user := old.user_id;
  else
    changed_table := new.table_name;
    changed_user := new.user_id;
  end if;

  if changed_table not in (
    'profiles', 'daily_health_metrics', 'daily_scores',
    'daily_calendar_metrics', 'daily_checkins', 'meals',
    'meal_photos', 'meal_analyses', 'meal_feelings',
    'journal_variables', 'journal_entries', 'journal_days',
    'lab_metric_preferences', 'nutrition_targets'
  ) then
    return null;
  end if;

  if changed_user is not null then
    insert into public.soma_lab_matrix_revisions (user_id, revision, updated_at)
    values (changed_user, gen_random_uuid(), now())
    on conflict (user_id) do update
      set revision = gen_random_uuid(), updated_at = now();
  end if;

  if tg_op = 'UPDATE' then
    if old.user_id is distinct from new.user_id and old.user_id is not null then
      insert into public.soma_lab_matrix_revisions (user_id, revision, updated_at)
      values (old.user_id, gen_random_uuid(), now())
      on conflict (user_id) do update
        set revision = gen_random_uuid(), updated_at = now();
    end if;
  end if;
  return null;
end;
$$;


revoke all on function public.bump_soma_lab_matrix_revision() from public, anon, authenticated;
grant execute on function public.bump_soma_lab_matrix_revision() to service_role;

create index if not exists soma_rows_retryable_meal_failure_idx
  on public.soma_rows((json_data->>'error_code'), (json_data->>'retry_after_at'), (json_data->>'failure_started_at'))
  where table_name = 'meal_analyses' and json_data->>'status' = 'failed';

create index if not exists soma_rows_journal_variables_order_idx
  on public.soma_rows(user_id, (json_data->>'position'), (json_data->>'created_at')) where table_name = 'journal_variables';
create index if not exists soma_rows_health_latest_by_type_idx
  on public.soma_rows(user_id, (json_data->>'data_type'), (json_data->>'civil_date') desc nulls last,
    (json_data->>'measured_at') desc nulls last)
  where table_name = 'health_records';
