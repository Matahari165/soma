-- Soma Personal Lab: private daily context and read-only calendar aggregates.

alter table public.provider_connections
  drop constraint if exists provider_connections_provider_check;

alter table public.provider_connections
  add constraint provider_connections_provider_check
  check (provider in ('google_health', 'google_calendar'));

create table public.daily_calendar_metrics (
  user_id uuid not null references auth.users(id) on delete cascade,
  metric_date date not null,
  deep_work_minutes smallint not null default 0 check (deep_work_minutes between 0 and 1440),
  deep_work_event_count smallint not null default 0 check (deep_work_event_count >= 0),
  total_scheduled_minutes smallint not null default 0 check (total_scheduled_minutes between 0 and 1440),
  source_event_count smallint not null default 0 check (source_event_count >= 0),
  synced_at timestamptz not null default now(),
  primary key (user_id, metric_date)
);

comment on table public.daily_calendar_metrics is
  'Daily duration aggregates derived from Google Calendar. Event titles and descriptions are never stored.';

create table public.daily_checkins (
  user_id uuid not null references auth.users(id) on delete cascade,
  checkin_date date not null,
  energy smallint check (energy between 1 and 5),
  focus smallint check (focus between 1 and 5),
  stress smallint check (stress between 1 and 5),
  mood smallint check (mood between 1 and 5),
  soreness smallint check (soreness between 1 and 5),
  caffeine_servings numeric(4,1) check (caffeine_servings between 0 and 20),
  alcohol_servings numeric(4,1) check (alcohol_servings between 0 and 20),
  late_meal boolean,
  illness boolean,
  deep_work_minutes_override smallint check (deep_work_minutes_override between 0 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, checkin_date)
);

comment on column public.daily_checkins.deep_work_minutes_override is
  'Optional user correction. When present, it replaces the read-only calendar aggregate for analysis.';

create trigger daily_checkins_set_updated_at before update on public.daily_checkins
for each row execute function public.set_updated_at();

alter table public.daily_calendar_metrics enable row level security;
alter table public.daily_checkins enable row level security;

create policy daily_calendar_metrics_read_own on public.daily_calendar_metrics
for select to authenticated using ((select auth.uid()) = user_id);

create policy daily_checkins_owner on public.daily_checkins
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select on public.daily_calendar_metrics to authenticated;
grant select, insert, update, delete on public.daily_checkins to authenticated;

grant select, insert, update, delete on public.daily_calendar_metrics,
  public.daily_checkins to service_role;
