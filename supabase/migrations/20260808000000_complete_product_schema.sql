-- Soma phases 2–9: health ingestion, analytics, Coach, workouts, and privacy.

create type public.import_range_type as enum ('90_days', 'all_history');
create type public.score_kind as enum ('sleep', 'recovery', 'effort');
create type public.job_status as enum ('queued', 'running', 'completed', 'failed', 'cancelled');
create type public.connection_status as enum ('connected', 'expired', 'revoked', 'error');
create type public.insight_category as enum ('positive', 'attention', 'information');
create type public.brief_kind as enum ('morning', 'evening', 'weekly');
create type public.action_status as enum ('proposed', 'confirmed', 'executed', 'rejected', 'failed');

alter table public.profiles
  add column import_range public.import_range_type not null default '90_days',
  add column privacy_version text,
  add column terms_version text;

create table public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google_health')),
  external_user_id text,
  legacy_user_id text,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status public.connection_status not null default 'connected',
  last_synced_at timestamptz,
  last_error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid references public.provider_connections(id) on delete cascade,
  import_range public.import_range_type not null default '90_days',
  data_types text[] not null default '{}',
  range_start timestamptz,
  range_end timestamptz,
  cursor jsonb not null default '{}'::jsonb,
  status public.job_status not null default 'queued',
  progress smallint not null default 0 check (progress between 0 and 100),
  attempts smallint not null default 0 check (attempts >= 0),
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'google_health',
  deduplication_key text not null unique,
  health_user_id text,
  data_type text,
  operation text,
  payload jsonb not null,
  status public.job_status not null default 'queued',
  attempts smallint not null default 0,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text
);

create table public.ingestion_checkpoints (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  data_type text not null,
  latest_completed_at timestamptz,
  oldest_completed_at timestamptz,
  next_page_token text,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider, data_type)
);

create table public.health_records (
  id uuid primary key default gen_random_uuid(),
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
  ingested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, data_type, source_record_id)
);

create index health_records_user_type_time_idx
  on public.health_records (user_id, data_type, measured_at desc);
create index health_records_user_civil_date_idx
  on public.health_records (user_id, civil_date desc);

create table public.daily_health_metrics (
  user_id uuid not null references auth.users(id) on delete cascade,
  metric_date date not null,
  sleep_minutes smallint,
  sleep_need_minutes smallint,
  sleep_efficiency numeric(5,2),
  sleep_regularity numeric(5,2),
  bedtime timestamptz,
  wake_time timestamptz,
  hrv_ms numeric(8,2),
  resting_heart_rate numeric(6,2),
  respiratory_rate numeric(6,2),
  oxygen_saturation numeric(5,2),
  skin_temperature_delta numeric(5,2),
  steps integer,
  active_energy_kcal numeric(10,2),
  zone_minutes numeric(8,2),
  exercise_minutes numeric(8,2),
  data_quality jsonb not null default '{}'::jsonb,
  source_freshness jsonb not null default '{}'::jsonb,
  algorithm_input_version text not null default 'metrics-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, metric_date)
);

create table public.daily_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  score_date date not null,
  kind public.score_kind not null,
  score smallint check (score is null or score between 0 and 100),
  status text not null check (status in ('restorative', 'steady', 'building', 'limited')),
  drivers jsonb not null default '{}'::jsonb,
  algorithm_version text not null,
  calculated_at timestamptz not null default now(),
  unique (user_id, score_date, kind)
);

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category public.insight_category not null,
  insight_type text not null,
  title text not null check (char_length(title) <= 160),
  description text not null check (char_length(description) <= 1200),
  evidence jsonb not null,
  rule_version text not null,
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  status text not null default 'unread' check (status in ('unread', 'read', 'acknowledged', 'dismissed')),
  evidence_start date,
  evidence_end date,
  deduplication_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, deduplication_key)
);

create table public.correlation_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  variable_x text not null,
  variable_y text not null,
  lag_days smallint not null default 0,
  method text not null default 'spearman',
  coefficient numeric(7,6),
  sample_size integer not null check (sample_size >= 0),
  date_start date not null,
  date_end date not null,
  quality_status text not null check (quality_status in ('ready', 'limited', 'insufficient')),
  explanation text,
  algorithm_version text not null,
  calculated_at timestamptz not null default now(),
  unique (user_id, variable_x, variable_y, lag_days, date_start, date_end)
);

create table public.briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.brief_kind not null,
  brief_date date not null,
  deterministic_facts jsonb not null,
  generated_text text not null,
  ai_generated boolean not null default false,
  model text,
  created_at timestamptz not null default now(),
  unique (user_id, kind, brief_date)
);

create table public.coach_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation' check (char_length(title) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.coach_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 12000),
  evidence_refs jsonb not null default '[]'::jsonb,
  model text,
  token_usage jsonb,
  created_at timestamptz not null default now()
);

create index coach_messages_thread_time_idx
  on public.coach_messages (thread_id, created_at);

create table public.agent_action_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid references public.coach_threads(id) on delete cascade,
  tool_name text not null,
  arguments jsonb not null,
  preview text not null,
  status public.action_status not null default 'proposed',
  idempotency_key text not null,
  receipt jsonb,
  confirmed_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table public.exercise_library (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  muscle_groups text[] not null default '{}',
  equipment text[] not null default '{}',
  instructions text[] not null default '{}',
  media_url text,
  media_kind text check (media_kind is null or media_kind in ('image', 'gif', 'video')),
  media_provenance text,
  created_at timestamptz not null default now()
);

create table public.workout_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  goal public.fitness_goal_type,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workout_program_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid not null references public.workout_programs(id) on delete cascade,
  exercise_id uuid not null references public.exercise_library(id),
  day_index smallint not null default 0 check (day_index between 0 and 13),
  position smallint not null check (position >= 0),
  target_sets smallint not null default 3 check (target_sets between 1 and 20),
  target_reps_min smallint check (target_reps_min is null or target_reps_min between 1 and 1000),
  target_reps_max smallint check (target_reps_max is null or target_reps_max between 1 and 1000),
  target_seconds integer check (target_seconds is null or target_seconds between 1 and 86400),
  rest_seconds integer not null default 90 check (rest_seconds between 0 and 3600),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid references public.workout_programs(id) on delete set null,
  name text not null,
  status text not null default 'planned' check (status in ('planned', 'active', 'paused', 'completed', 'cancelled')),
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  perceived_exertion numeric(3,1) check (perceived_exertion is null or perceived_exertion between 0 and 10),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workout_session_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_id uuid not null references public.exercise_library(id),
  exercise_position smallint not null,
  set_index smallint not null,
  target_reps smallint,
  completed_reps smallint,
  weight_kg numeric(7,2),
  duration_seconds integer,
  rest_seconds integer,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, exercise_position, set_index)
);

create table public.consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_type text not null,
  version text not null,
  granted boolean not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  resource_type text,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Updated-at triggers.
create trigger provider_connections_set_updated_at before update on public.provider_connections
for each row execute function public.set_updated_at();
create trigger sync_jobs_set_updated_at before update on public.sync_jobs
for each row execute function public.set_updated_at();
create trigger health_records_set_updated_at before update on public.health_records
for each row execute function public.set_updated_at();
create trigger daily_health_metrics_set_updated_at before update on public.daily_health_metrics
for each row execute function public.set_updated_at();
create trigger coach_threads_set_updated_at before update on public.coach_threads
for each row execute function public.set_updated_at();
create trigger workout_programs_set_updated_at before update on public.workout_programs
for each row execute function public.set_updated_at();
create trigger workout_sessions_set_updated_at before update on public.workout_sessions
for each row execute function public.set_updated_at();

-- Row-level security.
alter table public.provider_connections enable row level security;
alter table public.sync_jobs enable row level security;
alter table public.webhook_events enable row level security;
alter table public.ingestion_checkpoints enable row level security;
alter table public.health_records enable row level security;
alter table public.daily_health_metrics enable row level security;
alter table public.daily_scores enable row level security;
alter table public.insights enable row level security;
alter table public.correlation_results enable row level security;
alter table public.briefs enable row level security;
alter table public.coach_threads enable row level security;
alter table public.coach_messages enable row level security;
alter table public.agent_action_proposals enable row level security;
alter table public.exercise_library enable row level security;
alter table public.workout_programs enable row level security;
alter table public.workout_program_exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_session_sets enable row level security;
alter table public.consent_events enable row level security;
alter table public.audit_events enable row level security;

-- OAuth secrets stay server-only. The application exposes a redacted status route.
create policy sync_jobs_owner on public.sync_jobs for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ingestion_checkpoints_owner on public.ingestion_checkpoints for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy health_records_owner on public.health_records for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy daily_health_metrics_owner on public.daily_health_metrics for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy daily_scores_owner on public.daily_scores for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy insights_owner on public.insights for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy correlations_owner on public.correlation_results for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy briefs_owner on public.briefs for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy coach_threads_owner on public.coach_threads for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy coach_messages_owner on public.coach_messages for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- Agent proposals are server-only because confirmed payloads can trigger writes.
create policy workout_programs_owner on public.workout_programs for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy workout_program_exercises_owner on public.workout_program_exercises for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy workout_sessions_owner on public.workout_sessions for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy workout_session_sets_owner on public.workout_session_sets for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy consent_events_owner on public.consent_events for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy audit_events_read_own on public.audit_events for select to authenticated
using ((select auth.uid()) = user_id);

create policy exercise_library_read on public.exercise_library for select to authenticated
using (owner_user_id is null or (select auth.uid()) = owner_user_id);
create policy exercise_library_manage_own on public.exercise_library for all to authenticated
using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);

-- Webhook and audit inserts are server-only through the service role.

grant usage on type public.import_range_type, public.score_kind, public.job_status,
  public.connection_status, public.insight_category, public.brief_kind, public.action_status
  to authenticated;

grant select on public.sync_jobs, public.ingestion_checkpoints, public.health_records,
  public.daily_health_metrics, public.daily_scores, public.insights,
  public.correlation_results, public.briefs, public.coach_threads,
  public.coach_messages, public.workout_programs, public.workout_program_exercises,
  public.workout_sessions, public.workout_session_sets, public.consent_events to authenticated;
grant select on public.exercise_library to authenticated;
grant select on public.audit_events to authenticated;

-- Starter exercise library. Media is intentionally empty until licensed assets are selected.
insert into public.exercise_library (name, muscle_groups, equipment, instructions) values
  ('Barbell back squat', array['quadriceps','glutes','hamstrings'], array['barbell','rack'], array['Brace your core and place the bar securely.','Sit down and back while keeping the whole foot grounded.','Drive through the floor to stand tall.']),
  ('Bench press', array['chest','triceps','front deltoids'], array['barbell','bench'], array['Set your shoulder blades and plant your feet.','Lower the bar with control to the lower chest.','Press up while maintaining your position.']),
  ('Romanian deadlift', array['hamstrings','glutes','back'], array['barbell'], array['Keep the bar close and soften the knees.','Hinge at the hips until the hamstrings are loaded.','Extend the hips to return to standing.']),
  ('Pull-up', array['lats','upper back','biceps'], array['pull-up bar'], array['Start from a controlled hang.','Pull the chest toward the bar without swinging.','Lower with control to full extension.']),
  ('Dumbbell shoulder press', array['shoulders','triceps'], array['dumbbells'], array['Brace the torso with dumbbells at shoulder height.','Press overhead without overextending the lower back.','Lower under control.']),
  ('Plank', array['core'], array['bodyweight'], array['Place elbows under shoulders.','Create a straight line from head to heels.','Breathe steadily while maintaining tension.']);
