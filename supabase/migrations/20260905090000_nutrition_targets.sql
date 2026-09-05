-- Persist nutrition targets on the profile instead of in one browser's localStorage.
-- The JSON document keeps the low/likely/high estimates versioned together and
-- matches the D1 soma_rows compatibility layer used by the deployed app.
create table if not exists public.nutrition_targets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  targets jsonb not null default '{
    "caloriesKcal": {"low": 2900, "likely": 3000, "high": 3100},
    "proteinG": {"low": 150, "likely": 160, "high": 170},
    "fatG": {"low": 70, "likely": 80, "high": 90},
    "carbsG": {"low": 350, "likely": 385, "high": 420},
    "fiberG": {"low": 25, "likely": 30, "high": 35},
    "surplusKcal": 300
  }'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists nutrition_targets_set_updated_at on public.nutrition_targets;
create trigger nutrition_targets_set_updated_at
before update on public.nutrition_targets
for each row execute function public.set_updated_at();

alter table public.nutrition_targets enable row level security;
drop policy if exists "Users can read their own nutrition targets" on public.nutrition_targets;
create policy "Users can read their own nutrition targets"
on public.nutrition_targets for select to authenticated
using ((select auth.uid()) = user_id);
drop policy if exists "Users can update their own nutrition targets" on public.nutrition_targets;
create policy "Users can update their own nutrition targets"
on public.nutrition_targets for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
drop policy if exists "Users can create their own nutrition targets" on public.nutrition_targets;
create policy "Users can create their own nutrition targets"
on public.nutrition_targets for insert to authenticated
with check ((select auth.uid()) = user_id);

grant select, insert, update on public.nutrition_targets to authenticated;
