-- Flexible personal journal and hourly Google Health scheduling.

alter table public.sync_jobs
  add column if not exists scheduled_sync_slot timestamptz;

alter table public.profiles
  alter column import_range set default 'all_history';

drop index if exists public.sync_jobs_one_automatic_per_day_idx;

create unique index if not exists sync_jobs_one_automatic_per_slot_idx
  on public.sync_jobs (connection_id, scheduled_sync_slot)
  where sync_trigger = 'automatic' and scheduled_sync_slot is not null;

create table public.journal_variables (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  variable_type text not null check (variable_type in ('boolean', 'count', 'duration', 'number', 'scale', 'category', 'time')),
  unit text check (unit is null or char_length(unit) <= 32),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  position smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name),
  unique (user_id, id)
);

create table public.journal_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  variable_id uuid not null,
  entry_date date not null,
  value jsonb not null check (jsonb_typeof(value) <> 'null'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, variable_id, entry_date),
  foreign key (user_id, variable_id) references public.journal_variables(user_id, id) on delete cascade
);

create table public.lab_narratives (
  user_id uuid primary key references auth.users(id) on delete cascade,
  headline text not null check (char_length(headline) between 1 and 220),
  summary text not null check (char_length(summary) between 1 and 1200),
  highlights jsonb not null default '[]'::jsonb check (jsonb_typeof(highlights) = 'array'),
  source_facts jsonb not null default '[]'::jsonb check (jsonb_typeof(source_facts) = 'array'),
  model text not null,
  generated_at timestamptz not null default now()
);

comment on table public.journal_entries is
  'One row is one observed value. A missing row means the variable was not recorded and must be excluded from analysis.';

create index journal_entries_user_date_idx
  on public.journal_entries (user_id, entry_date desc);

create trigger journal_variables_set_updated_at before update on public.journal_variables
for each row execute function public.set_updated_at();

create trigger journal_entries_set_updated_at before update on public.journal_entries
for each row execute function public.set_updated_at();

alter table public.journal_variables enable row level security;
alter table public.journal_entries enable row level security;
alter table public.lab_narratives enable row level security;

create policy journal_variables_owner on public.journal_variables
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy journal_entries_owner on public.journal_entries
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy lab_narratives_read_own on public.lab_narratives
for select to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.journal_variables, public.journal_entries to authenticated;
grant select, insert, update, delete on public.journal_variables, public.journal_entries to service_role;
grant select on public.lab_narratives to authenticated;
grant select, insert, update, delete on public.lab_narratives to service_role;
