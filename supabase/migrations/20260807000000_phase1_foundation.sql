-- Soma Phase 1: multi-user foundation.
-- Apply through the Supabase CLI or dashboard after creating a project.

create extension if not exists pgcrypto;

create type public.fitness_goal_type as enum (
  'build_muscle',
  'improve_endurance',
  'improve_cardio',
  'general_fitness',
  'maintain_health',
  'other'
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 80),
  timezone text not null default 'Europe/Paris',
  date_of_birth date,
  height_cm numeric(5, 2) check (height_cm is null or height_cm between 50 and 260),
  weight_kg numeric(5, 2) check (weight_kg is null or weight_kg between 20 and 400),
  sex_for_health_calculations text check (
    sex_for_health_calculations is null
    or sex_for_health_calculations in ('female', 'male', 'intersex', 'prefer_not_to_say')
  ),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.health_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_type public.fitness_goal_type not null,
  custom_label text check (custom_label is null or char_length(custom_label) <= 120),
  priority smallint not null check (priority in (1, 2)),
  starts_on date not null default current_date,
  ended_on date check (ended_on is null or ended_on >= starts_on),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index one_active_goal_per_priority
  on public.health_goals (user_id, priority)
  where ended_on is null;

create table public.sleep_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  base_target_minutes smallint not null default 480
    check (base_target_minutes between 240 and 720),
  usual_wake_time time,
  wind_down_minutes smallint not null default 30
    check (wind_down_minutes between 0 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dashboard_layouts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  layout jsonb not null default '{"widgets": []}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger health_goals_set_updated_at
before update on public.health_goals
for each row execute function public.set_updated_at();

create trigger sleep_preferences_set_updated_at
before update on public.sleep_preferences
for each row execute function public.set_updated_at();

create trigger dashboard_layouts_set_updated_at
before update on public.dashboard_layouts
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 80), '')
  )
  on conflict (user_id) do nothing;

  insert into public.sleep_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.dashboard_layouts (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.health_goals enable row level security;
alter table public.sleep_preferences enable row level security;
alter table public.dashboard_layouts enable row level security;

create policy "Users can read their own profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can read their own goals"
on public.health_goals for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own goals"
on public.health_goals for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own goals"
on public.health_goals for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own goals"
on public.health_goals for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own sleep preferences"
on public.sleep_preferences for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can update their own sleep preferences"
on public.sleep_preferences for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can read their own dashboard layout"
on public.dashboard_layouts for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can update their own dashboard layout"
on public.dashboard_layouts for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on function public.handle_new_user() from public;
revoke all on function public.set_updated_at() from public;

grant usage on type public.fitness_goal_type to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.health_goals to authenticated;
grant select, update on public.sleep_preferences to authenticated;
grant select, update on public.dashboard_layouts to authenticated;
