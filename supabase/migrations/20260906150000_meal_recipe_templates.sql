-- Personal recurring recipes are context for meal analysis only. Their
-- ingredients and usual amounts are indicative and never replace the evidence
-- from the meal's current photo or description.
create table if not exists public.meal_recipe_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  dish_type text,
  description text,
  ingredients jsonb not null default '[]'::jsonb,
  aliases jsonb not null default '[]'::jsonb,
  common_variations jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

comment on table public.meal_recipe_templates is 'Indicative personal meal recipes used as optional analysis context, never as authoritative quantities.';
comment on column public.meal_recipe_templates.ingredients is 'JSON ingredients with usual, variable amounts; not a measured serving record.';

drop trigger if exists meal_recipe_templates_set_updated_at on public.meal_recipe_templates;
create trigger meal_recipe_templates_set_updated_at
before update on public.meal_recipe_templates
for each row execute function public.set_updated_at();

alter table public.meal_recipe_templates enable row level security;

drop policy if exists "Users can read their own meal recipes" on public.meal_recipe_templates;
create policy "Users can read their own meal recipes"
on public.meal_recipe_templates for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own meal recipes" on public.meal_recipe_templates;
create policy "Users can create their own meal recipes"
on public.meal_recipe_templates for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own meal recipes" on public.meal_recipe_templates;
create policy "Users can update their own meal recipes"
on public.meal_recipe_templates for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own meal recipes" on public.meal_recipe_templates;
create policy "Users can delete their own meal recipes"
on public.meal_recipe_templates for delete to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.meal_recipe_templates to authenticated;
