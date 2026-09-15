-- The Supabase runtime stores logical health records in soma_rows.json_data.
-- Index the JSON fields used by the server-side health reads; indexes on the
-- legacy public.health_records table cannot help this compatibility path.

create index if not exists soma_rows_daily_metrics_date_idx
  on public.soma_rows (
    user_id,
    (json_data->>'metric_date') desc
  )
  where table_name = 'daily_health_metrics'
    and json_data->>'metric_date' is not null;

create index if not exists soma_rows_daily_scores_kind_date_idx
  on public.soma_rows (
    user_id,
    (json_data->>'kind'),
    (json_data->>'score_date') desc
  )
  where table_name = 'daily_scores'
    and json_data->>'score_date' is not null;

create index if not exists soma_rows_health_sleep_exercise_date_idx
  on public.soma_rows (
    user_id,
    (json_data->>'data_type'),
    (json_data->>'civil_date') desc,
    (json_data->>'end_time') desc
  )
  where table_name = 'health_records'
    and json_data->>'data_type' in ('sleep', 'exercise');

create index if not exists soma_rows_health_civil_date_idx
  on public.soma_rows (
    user_id,
    (json_data->>'data_type'),
    (json_data->>'civil_date') desc
  )
  where table_name = 'health_records'
    and json_data->>'civil_date' is not null;

create index if not exists soma_rows_health_end_time_idx
  on public.soma_rows (
    user_id,
    (json_data->>'data_type'),
    (json_data->>'end_time') desc
  )
  where table_name = 'health_records'
    and json_data->>'end_time' is not null;

create index if not exists soma_rows_health_start_time_idx
  on public.soma_rows (
    user_id,
    (json_data->>'data_type'),
    (json_data->>'start_time') desc
  )
  where table_name = 'health_records'
    and json_data->>'start_time' is not null;

create index if not exists soma_rows_health_measured_at_idx
  on public.soma_rows (
    user_id,
    (json_data->>'data_type'),
    (json_data->>'measured_at') desc
  )
  where table_name = 'health_records'
    and json_data->>'measured_at' is not null;
