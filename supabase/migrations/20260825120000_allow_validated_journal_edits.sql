-- A validated day remains part of the analysis after edits. The journal is
-- editable without downgrading the day back to a draft.

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
  v_validated_at timestamptz;
  v_remains_validated boolean;
begin
  insert into public.journal_days (user_id, entry_date, status)
  values (p_user_id, p_entry_date, 'draft')
  on conflict (user_id, entry_date) do nothing;

  select status, validated_at into v_status, v_validated_at
  from public.journal_days
  where user_id = p_user_id and entry_date = p_entry_date
  for update;

  v_remains_validated := p_validate or v_status = 'validated';

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
  set status = case when v_remains_validated then 'validated' else 'draft' end,
      validated_at = case when v_remains_validated then coalesce(v_validated_at, now()) else null end,
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
