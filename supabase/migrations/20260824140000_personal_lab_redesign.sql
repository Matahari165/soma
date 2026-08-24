-- Personal Lab journal lifecycle, configurable metric registry, and insight history.

alter table public.sleep_preferences
  alter column base_target_minutes set default 510;

update public.sleep_preferences
set base_target_minutes = 510
where base_target_minutes <> 510;

alter table public.journal_variables
  add column if not exists emoji text not null default '🧪' check (char_length(emoji) between 1 and 8),
  add column if not exists default_value jsonb,
  add column if not exists day_period text not null default 'day'
    check (day_period in ('context', 'morning', 'day', 'evening', 'sleep', 'other'));

create table if not exists public.journal_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  status text not null default 'draft' check (status in ('draft', 'validated')),
  validated_at timestamptz,
  omitted_variables jsonb not null default '[]'::jsonb check (jsonb_typeof(omitted_variables) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, entry_date),
  check ((status = 'validated' and validated_at is not null) or status = 'draft')
);

create trigger journal_days_set_updated_at before update on public.journal_days
for each row execute function public.set_updated_at();

insert into public.journal_days (user_id, entry_date, status, validated_at)
select user_id, entry_date, 'validated', max(updated_at)
from public.journal_entries
group by user_id, entry_date
on conflict (user_id, entry_date) do nothing;

alter table public.journal_days enable row level security;
create policy journal_days_owner on public.journal_days
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke insert, update, delete on public.journal_variables, public.journal_entries from authenticated;
grant select on public.journal_days to authenticated;
grant select, insert, update, delete on public.journal_days to service_role;

create or replace function public.save_personal_lab_journal_day(
  p_user_id uuid,
  p_entry_date date,
  p_entries jsonb,
  p_validate boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  insert into public.journal_days (user_id, entry_date, status)
  values (p_user_id, p_entry_date, 'draft')
  on conflict (user_id, entry_date) do nothing;

  select status into v_status
  from public.journal_days
  where user_id = p_user_id and entry_date = p_entry_date
  for update;

  if v_status = 'validated' then
    raise exception 'journal_day_locked';
  end if;

  delete from public.journal_entries as entry
  where entry.user_id = p_user_id
    and entry.entry_date = p_entry_date
    and entry.variable_id in (
      select (item ->> 'variable_id')::uuid
      from jsonb_array_elements(p_entries) as item
      where item -> 'value' = 'null'::jsonb
    );

  insert into public.journal_entries (user_id, variable_id, entry_date, value)
  select p_user_id, (item ->> 'variable_id')::uuid, p_entry_date, item -> 'value'
  from jsonb_array_elements(p_entries) as item
  join public.journal_variables as variable
    on variable.id = (item ->> 'variable_id')::uuid
   and variable.user_id = p_user_id
   and variable.is_active
  where item -> 'value' <> 'null'::jsonb
  on conflict (user_id, variable_id, entry_date)
  do update set value = excluded.value, updated_at = now();

  update public.journal_days
  set status = case when p_validate then 'validated' else 'draft' end,
      validated_at = case when p_validate then now() else null end,
      omitted_variables = coalesce((
        select jsonb_agg(item ->> 'variable_id')
        from jsonb_array_elements(p_entries) as item
        where item -> 'value' = 'null'::jsonb
      ), '[]'::jsonb)
  where user_id = p_user_id and entry_date = p_entry_date;
end;
$$;

revoke all on function public.save_personal_lab_journal_day(uuid, date, jsonb, boolean) from public, authenticated;
grant execute on function public.save_personal_lab_journal_day(uuid, date, jsonb, boolean) to service_role;

create table if not exists public.lab_metric_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  metric_id text not null check (char_length(metric_id) between 1 and 100),
  role text not null check (role in ('influence', 'result', 'both', 'disabled')),
  updated_at timestamptz not null default now(),
  primary key (user_id, metric_id)
);

create trigger lab_metric_preferences_set_updated_at before update on public.lab_metric_preferences
for each row execute function public.set_updated_at();

alter table public.lab_metric_preferences enable row level security;
create policy lab_metric_preferences_owner on public.lab_metric_preferences
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select on public.lab_metric_preferences to authenticated;
grant select, insert, update, delete on public.lab_metric_preferences to service_role;

create table if not exists public.lab_narrative_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  headline text not null check (char_length(headline) between 1 and 220),
  summary text not null check (char_length(summary) between 1 and 1200),
  highlights jsonb not null default '[]'::jsonb check (jsonb_typeof(highlights) = 'array'),
  source_facts jsonb not null default '[]'::jsonb check (jsonb_typeof(source_facts) = 'array'),
  model text not null,
  liked boolean not null default false,
  generated_at timestamptz not null default now()
);

create index if not exists lab_narrative_history_user_date_idx
  on public.lab_narrative_history (user_id, generated_at desc);

insert into public.lab_narrative_history
  (user_id, headline, summary, highlights, source_facts, model, generated_at)
select user_id, headline, summary, highlights, source_facts, model, generated_at
from public.lab_narratives as narrative
where not exists (
  select 1
  from public.lab_narrative_history as history
  where history.user_id = narrative.user_id
    and history.generated_at = narrative.generated_at
);

alter table public.lab_narrative_history enable row level security;
create policy lab_narrative_history_read_own on public.lab_narrative_history
for select to authenticated using ((select auth.uid()) = user_id);
create policy lab_narrative_history_update_own on public.lab_narrative_history
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select on public.lab_narrative_history to authenticated;
grant update (liked) on public.lab_narrative_history to authenticated;
grant select, insert, update, delete on public.lab_narrative_history to service_role;

with candidates as (
  select variable.id, variable.user_id, replacements.canonical_name,
    row_number() over (partition by variable.user_id, replacements.canonical_name order by variable.position, variable.id) as candidate_rank
  from public.journal_variables as variable
  join (values
    ('whm rounds', 'WHM'),
    ('breathing before sleep', 'Breathing exercise'),
    ('reading 30 min', 'Reading for 30 minutes'),
    ('reading before sleep', 'Reading for 30 minutes'),
    ('dark bedroom', 'Dark room')
  ) as replacements(old_name, canonical_name)
    on lower(variable.name) = replacements.old_name
)
update public.journal_variables as variable
set name = candidates.canonical_name
from candidates
where variable.id = candidates.id
  and candidates.candidate_rank = 1
  and not exists (
    select 1 from public.journal_variables as canonical
    where canonical.user_id = candidates.user_id
      and lower(canonical.name) = lower(candidates.canonical_name)
  );

update public.journal_variables
set is_active = false
where lower(name) in (
  'deep work',
  'added-sugar servings',
  'reading before sleep',
  'reading 30 min',
  'breathing before sleep',
  'whm rounds',
  'dark bedroom'
);

with defaults(name, variable_type, unit, position, emoji, day_period, default_value) as (
  values
    ('Vacation', 'boolean', null, 0, '🏖️', 'context', 'false'::jsonb),
    ('Illness', 'boolean', null, 5, '🤒', 'context', 'false'::jsonb),
    ('Breakfast', 'boolean', null, 10, '🍳', 'morning', 'false'::jsonb),
    ('WHM', 'count', 'rounds', 20, '🫁', 'morning', '0'::jsonb),
    ('Caffeine', 'number', 'mg', 30, '☕', 'morning', '0'::jsonb),
    ('Added sugar', 'number', 'g', 40, '🍬', 'day', '0'::jsonb),
    ('Masturbation', 'boolean', null, 50, '✋', 'day', 'false'::jsonb),
    ('Alcohol', 'count', 'drinks', 60, '🍷', 'evening', '0'::jsonb),
    ('Dinner end time', 'time', null, 70, '🍽️', 'evening', null::jsonb),
    ('Magnesium', 'number', 'mg', 80, '💊', 'evening', '0'::jsonb),
    ('Breathing exercise', 'boolean', null, 90, '🌬️', 'sleep', 'false'::jsonb),
    ('Reading for 30 minutes', 'boolean', null, 100, '📖', 'sleep', 'false'::jsonb),
    ('Dark room', 'boolean', null, 110, '🌑', 'sleep', 'true'::jsonb)
)
insert into public.journal_variables
  (user_id, name, variable_type, unit, options, position, emoji, day_period, default_value)
select users.id, defaults.name, defaults.variable_type, defaults.unit, '[]'::jsonb,
  defaults.position, defaults.emoji, defaults.day_period, defaults.default_value
from auth.users as users
cross join defaults
on conflict (user_id, name) do update set
  variable_type = excluded.variable_type,
  unit = excluded.unit,
  position = excluded.position,
  emoji = excluded.emoji,
  day_period = excluded.day_period,
  default_value = excluded.default_value,
  is_active = true;

comment on table public.journal_days is
  'Draft values persist immediately. Only validated dates are eligible for Personal Lab analysis.';
comment on table public.lab_metric_preferences is
  'Per-user role for every metric received by the health pipeline.';
