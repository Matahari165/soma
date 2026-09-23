-- Invalidate the Personal Lab matrix in the same transaction as every
-- analytical row change, including writes that bypass the TypeScript adapter.
create table if not exists public.soma_lab_matrix_revisions (
  user_id text primary key references public.soma_users(id) on delete cascade,
  revision uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now()
);

alter table public.soma_lab_matrix_revisions enable row level security;
grant select, insert, update, delete on public.soma_lab_matrix_revisions to service_role;

create or replace function public.bump_soma_lab_matrix_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_table text;
  changed_user text;
begin
  if tg_op = 'DELETE' then
    changed_table := old.table_name;
    changed_user := old.user_id;
  else
    changed_table := new.table_name;
    changed_user := new.user_id;
  end if;

  if changed_table not in (
    'profiles', 'daily_health_metrics', 'daily_scores',
    'daily_calendar_metrics', 'daily_checkins', 'meals',
    'meal_photos', 'meal_analyses', 'meal_feelings',
    'journal_variables', 'journal_entries', 'journal_days',
    'lab_metric_preferences'
  ) then
    return null;
  end if;

  if changed_user is not null then
    insert into public.soma_lab_matrix_revisions (user_id, revision, updated_at)
    values (changed_user, gen_random_uuid(), now())
    on conflict (user_id) do update
      set revision = gen_random_uuid(), updated_at = now();
  end if;

  if tg_op = 'UPDATE' then
    if old.user_id is distinct from new.user_id and old.user_id is not null then
      insert into public.soma_lab_matrix_revisions (user_id, revision, updated_at)
      values (old.user_id, gen_random_uuid(), now())
      on conflict (user_id) do update
        set revision = gen_random_uuid(), updated_at = now();
    end if;
  end if;
  return null;
end;
$$;

create trigger soma_rows_lab_matrix_revision
after insert or update or delete on public.soma_rows
for each row execute function public.bump_soma_lab_matrix_revision();
