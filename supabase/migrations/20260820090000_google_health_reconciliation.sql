-- Stage every page, then publish a complete Google Health window atomically.

alter table public.sync_jobs
  add column if not exists retry_after timestamptz;

create table if not exists public.google_health_reconciliation_stage (
  job_id uuid not null references public.sync_jobs(id) on delete cascade,
  reconciliation_token text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google_health',
  data_type text not null,
  source_record_id text not null,
  start_time timestamptz,
  end_time timestamptz,
  civil_date date,
  recording_method text,
  source_device text,
  payload jsonb not null,
  measured_at timestamptz,
  updated_at timestamptz not null,
  staged_at timestamptz not null default now(),
  primary key (job_id, reconciliation_token, source_record_id)
);

create index if not exists google_health_reconciliation_stage_lookup_idx
  on public.google_health_reconciliation_stage (reconciliation_token, user_id, data_type);

revoke all on table public.google_health_reconciliation_stage from public, anon, authenticated;
grant select, insert, update, delete on table public.google_health_reconciliation_stage to service_role;

create or replace function public.reconcile_google_health_window(
  p_user_id uuid,
  p_data_type text,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_date_based boolean,
  p_reconciliation_token text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
  v_start_date date := (p_window_start at time zone 'UTC')::date;
  v_end_date date := (p_window_end at time zone 'UTC')::date;
begin
  if p_user_id is null or p_data_type is null or p_reconciliation_token is null or p_window_end <= p_window_start then
    raise exception 'Invalid Google Health reconciliation window' using errcode = '22023';
  end if;

  if p_window_end <> date_trunc('day', p_window_end) then
    v_end_date := v_end_date + 1;
  end if;

  insert into public.health_records (
    user_id, provider, data_type, source_record_id, start_time, end_time, civil_date,
    recording_method, source_device, payload, measured_at, updated_at
  )
  select
    stage.user_id, stage.provider, stage.data_type, stage.source_record_id, stage.start_time,
    stage.end_time, stage.civil_date, stage.recording_method, stage.source_device, stage.payload,
    stage.measured_at, stage.updated_at
  from public.google_health_reconciliation_stage as stage
  where stage.reconciliation_token = p_reconciliation_token
    and stage.user_id = p_user_id
    and stage.data_type = p_data_type
  on conflict (user_id, provider, data_type, source_record_id) do update set
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    civil_date = excluded.civil_date,
    recording_method = excluded.recording_method,
    source_device = excluded.source_device,
    payload = excluded.payload,
    measured_at = excluded.measured_at,
    ingested_at = now(),
    updated_at = excluded.updated_at;

  delete from public.health_records as record
  where record.user_id = p_user_id
    and record.provider = 'google_health'
    and record.data_type = p_data_type
    and (
      (p_date_based and record.civil_date >= v_start_date and record.civil_date < v_end_date)
      or
      (not p_date_based and coalesce(record.start_time, record.measured_at, record.end_time) >= p_window_start and coalesce(record.start_time, record.measured_at, record.end_time) < p_window_end)
    )
    and not exists (
      select 1
      from public.google_health_reconciliation_stage as stage
      where stage.reconciliation_token = p_reconciliation_token
        and stage.user_id = p_user_id
        and stage.data_type = p_data_type
        and stage.source_record_id = record.source_record_id
    );

  get diagnostics v_deleted = row_count;

  delete from public.google_health_reconciliation_stage
  where reconciliation_token = p_reconciliation_token
    and user_id = p_user_id
    and data_type = p_data_type;

  return v_deleted;
end;
$$;

revoke all on function public.reconcile_google_health_window(uuid, text, timestamptz, timestamptz, boolean, text)
  from public, anon, authenticated;
grant execute on function public.reconcile_google_health_window(uuid, text, timestamptz, timestamptz, boolean, text)
  to service_role;
