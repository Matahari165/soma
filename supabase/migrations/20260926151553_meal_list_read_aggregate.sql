-- One bounded server-side read for meal history and its display children.
-- Keep all photos/feelings but transfer only the newest analysis and newest
-- completed result for each meal.
create or replace function public.soma_meal_list_aggregate(p_user_id text, p_from text, p_to text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  result jsonb;
begin
  if p_user_id is null or btrim(p_user_id) = ''
    or p_from is null or p_to is null
    or p_from !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or p_to !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'A user and bounded ISO date range are required.' using errcode = '22023';
  end if;

  if p_from::date > p_to::date then
    raise exception 'The meal date range is invalid.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'meal_row', meal.json_data,
    'photo_rows', coalesce(photos.rows, '[]'::jsonb),
    'feelings_row', feelings.payload,
    'latest_analysis_row', latest_analysis.payload,
    'last_successful_analysis_row', case
      when latest_analysis.payload->>'id' is distinct from last_successful_analysis.payload->>'id'
        then last_successful_analysis.payload
      else null
    end
  ) order by meal.json_data->>'meal_date' desc,
    meal.json_data->>'created_at' desc, meal.json_data->>'id' asc), '[]'::jsonb)
  into result
  from public.soma_rows meal
  left join lateral (
    select jsonb_agg(photo.json_data order by photo.json_data->>'created_at' asc, photo.json_data->>'id' asc) as rows
    from public.soma_rows photo
    where photo.table_name = 'meal_photos'
      and photo.user_id = p_user_id
      and photo.json_data->>'meal_id' = meal.json_data->>'id'
  ) photos on true
  left join lateral (
    select feeling.json_data as payload
    from public.soma_rows feeling
    where feeling.table_name = 'meal_feelings'
      and feeling.user_id = p_user_id
      and feeling.json_data->>'meal_id' = meal.json_data->>'id'
    order by feeling.json_data->>'created_at' desc, feeling.json_data->>'id' desc
    limit 1
  ) feelings on true
  left join lateral (
    select analysis.json_data as payload
    from public.soma_rows analysis
    where analysis.table_name = 'meal_analyses'
      and analysis.user_id = p_user_id
      and analysis.json_data->>'meal_id' = meal.json_data->>'id'
    order by analysis.json_data->>'created_at' desc, analysis.json_data->>'id' asc
    limit 1
  ) latest_analysis on true
  left join lateral (
    select analysis.json_data as payload
    from public.soma_rows analysis
    where analysis.table_name = 'meal_analyses'
      and analysis.user_id = p_user_id
      and analysis.json_data->>'meal_id' = meal.json_data->>'id'
      and analysis.json_data->>'status' = 'completed'
      and jsonb_typeof(analysis.json_data->'result') in ('object', 'array')
    order by analysis.json_data->>'created_at' desc, analysis.json_data->>'id' asc
    limit 1
  ) last_successful_analysis on true
  where meal.table_name = 'meals'
    and meal.user_id = p_user_id
    and meal.json_data->>'meal_date' >= p_from
    and meal.json_data->>'meal_date' <= p_to;

  return result;
end;
$$;

revoke all on function public.soma_meal_list_aggregate(text, text, text) from public, anon, authenticated;
grant execute on function public.soma_meal_list_aggregate(text, text, text) to service_role;
