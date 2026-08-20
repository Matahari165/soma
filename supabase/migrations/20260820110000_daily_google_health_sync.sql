-- Guarantees at most one automatic Google Health import per connection and civil day.

alter table public.sync_jobs
  add column if not exists sync_trigger text not null default 'manual'
    check (sync_trigger in ('initial', 'automatic', 'manual', 'webhook')),
  add column if not exists scheduled_civil_date date;

create unique index if not exists sync_jobs_one_automatic_per_day_idx
  on public.sync_jobs (connection_id, scheduled_civil_date)
  where sync_trigger = 'automatic' and scheduled_civil_date is not null;

create index if not exists sync_jobs_trigger_status_created_idx
  on public.sync_jobs (sync_trigger, status, created_at);
