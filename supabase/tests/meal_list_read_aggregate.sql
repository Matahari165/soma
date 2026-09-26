-- Run only against an isolated database after the migration; all fixtures roll back.
begin;

insert into public.soma_users(id, google_subject, display_name, created_at, updated_at) values
  ('meal-list-fixture', 'meal-list-fixture', 'Synthetic fixture', now(), now()),
  ('meal-list-other', 'meal-list-other', 'Synthetic fixture', now(), now());

insert into public.soma_rows(table_name, row_key, user_id, json_data) values
  ('meals', 'meal-main', 'meal-list-fixture', '{"id":"meal-main","user_id":"meal-list-fixture","meal_date":"2026-09-15","meal_type":"lunch","note":"Soup","status":"confirmed","entry_state":"skipped","mouth_warmth_intensity":4,"stomach_overfull_intensity":3,"created_at":"2026-09-15T12:00:00.000Z","updated_at":"2026-09-15T12:00:00.000Z"}'),
  ('meals', 'meal-empty', 'meal-list-fixture', '{"id":"meal-empty","user_id":"meal-list-fixture","meal_date":"2026-09-16","meal_type":"snack","created_at":"2026-09-16T12:00:00.000Z","updated_at":"2026-09-16T12:00:00.000Z"}'),
  ('meals', 'meal-success-current', 'meal-list-fixture', '{"id":"meal-success-current","user_id":"meal-list-fixture","meal_date":"2026-09-17","meal_type":"dinner","created_at":"2026-09-17T12:00:00.000Z","updated_at":"2026-09-17T12:00:00.000Z"}'),
  ('meals', 'meal-outside', 'meal-list-fixture', '{"id":"meal-outside","user_id":"meal-list-fixture","meal_date":"2026-08-31","meal_type":"dinner","created_at":"2026-08-31T12:00:00.000Z","updated_at":"2026-08-31T12:00:00.000Z"}'),
  ('meals', 'meal-other', 'meal-list-other', '{"id":"meal-other","user_id":"meal-list-other","meal_date":"2026-09-15","meal_type":"lunch","created_at":"2026-09-15T12:00:00.000Z","updated_at":"2026-09-15T12:00:00.000Z"}'),
  ('meal_photos', 'photo-main-1', 'meal-list-fixture', '{"id":"photo-main-1","user_id":"meal-list-fixture","meal_id":"meal-main","origin":"homemade","object_path":"private/one.jpg","mime_type":"image/jpeg","bytes":12,"filename":"one.jpg","comment":"before eating","storage_status":"available","purged_at":null,"created_at":"2026-09-15T12:01:00.000Z"}'),
  ('meal_photos', 'photo-main-2', 'meal-list-fixture', '{"id":"photo-main-2","user_id":"meal-list-fixture","meal_id":"meal-main","origin":"restaurant","object_path":"private/two.jpg","mime_type":"image/jpeg","bytes":20,"filename":"two.jpg","comment":null,"storage_status":"purged","purged_at":"2026-09-15T12:02:00.000Z","created_at":"2026-09-15T12:02:00.000Z"}'),
  ('meal_photos', 'photo-other-user', 'meal-list-other', '{"id":"photo-other-user","user_id":"meal-list-other","meal_id":"meal-main","origin":"restaurant","object_path":"private/other.jpg","mime_type":"image/jpeg","bytes":20,"created_at":"2026-09-15T12:03:00.000Z"}'),
  ('meal_feelings', 'feeling-main', 'meal-list-fixture', '{"id":"feeling-main","user_id":"meal-list-fixture","meal_id":"meal-main","mouth_warmth_intensity":null,"stomach_overfull_intensity":2,"created_at":"2026-09-15T12:05:00.000Z","updated_at":"2026-09-15T12:05:00.000Z"}'),
  ('meal_feelings', 'feeling-other-user', 'meal-list-other', '{"id":"feeling-other-user","user_id":"meal-list-other","meal_id":"meal-main","mouth_warmth_intensity":5,"stomach_overfull_intensity":5,"created_at":"2026-09-15T12:06:00.000Z"}'),
  ('meal_analyses', 'analysis-old', 'meal-list-fixture', '{"id":"analysis-old","user_id":"meal-list-fixture","meal_id":"meal-main","status":"completed","provider":"xai","model":"grok","result":{"summary":"old"},"created_at":"2026-09-15T12:01:00.000Z","completed_at":"2026-09-15T12:01:01.000Z"}'),
  ('meal_analyses', 'analysis-success-new', 'meal-list-fixture', '{"id":"analysis-success-new","user_id":"meal-list-fixture","meal_id":"meal-main","status":"completed","provider":"xai","model":"grok","result":{"summary":"latest success"},"created_at":"2026-09-15T12:02:00.000Z","completed_at":"2026-09-15T12:02:01.000Z"}'),
  ('meal_analyses', 'analysis-success-tie', 'meal-list-fixture', '{"id":"analysis-success-tie","user_id":"meal-list-fixture","meal_id":"meal-main","status":"completed","provider":"xai","model":"grok","result":{"summary":"same timestamp"},"created_at":"2026-09-15T12:02:00.000Z","completed_at":"2026-09-15T12:02:01.000Z"}'),
  ('meal_analyses', 'analysis-failed-latest', 'meal-list-fixture', '{"id":"analysis-failed-latest","user_id":"meal-list-fixture","meal_id":"meal-main","status":"failed","provider":"xai","model":"grok","result":null,"error":"provider unavailable","created_at":"2026-09-15T12:03:00.000Z"}'),
  ('meal_analyses', 'analysis-failed-tie', 'meal-list-fixture', '{"id":"analysis-failed-tie","user_id":"meal-list-fixture","meal_id":"meal-main","status":"failed","provider":"xai","model":"grok","result":null,"error":"provider unavailable","created_at":"2026-09-15T12:03:00.000Z"}'),
  ('meal_analyses', 'analysis-other-user', 'meal-list-other', '{"id":"analysis-other-user","user_id":"meal-list-other","meal_id":"meal-main","status":"completed","provider":"xai","model":"grok","result":{"summary":"private"},"created_at":"2026-09-15T12:04:00.000Z"}'),
  ('meal_analyses', 'analysis-success-current', 'meal-list-fixture', '{"id":"analysis-success-current","user_id":"meal-list-fixture","meal_id":"meal-success-current","status":"completed","provider":"xai","model":"grok","result":{"summary":"current success"},"created_at":"2026-09-17T12:01:00.000Z","completed_at":"2026-09-17T12:01:01.000Z"}');

insert into public.soma_rows(table_name, row_key, user_id, json_data)
select 'meals', 'meal-bulk-' || n, 'meal-list-fixture', jsonb_build_object(
  'id', 'meal-bulk-' || n,
  'user_id', 'meal-list-fixture',
  'meal_date', '2026-09-20',
  'meal_type', 'snack',
  'created_at', '2026-09-20T12:00:00.000Z',
  'updated_at', '2026-09-20T12:00:00.000Z'
)
from generate_series(1, 1001) n;

do $$
declare
  main_row jsonb;
  empty_row jsonb;
  success_row jsonb;
  aggregate_rows jsonb;
begin
  aggregate_rows := public.soma_meal_list_aggregate('meal-list-fixture', '2026-09-01', '2026-09-30');
  if jsonb_array_length(aggregate_rows) <> 1004 then
    raise exception 'User/date filtering or complete history result changed: %', jsonb_array_length(aggregate_rows);
  end if;

  select item into main_row
  from jsonb_array_elements(aggregate_rows) as aggregate_item(item)
  where item->'meal_row'->>'id' = 'meal-main';
  if main_row is null then raise exception 'In-range meal disappeared from the aggregate'; end if;
  if jsonb_array_length(main_row->'photo_rows') <> 2
    or exists (select 1 from jsonb_array_elements(main_row->'photo_rows') as photos(photo_row) where photo_row->>'id' = 'photo-other-user') then
    raise exception 'Photos were truncated or leaked across owners: %', main_row->'photo_rows';
  end if;
  if main_row->'feelings_row'->'mouth_warmth_intensity' is distinct from 'null'::jsonb
    or main_row->'feelings_row'->>'stomach_overfull_intensity' <> '2' then
    raise exception 'Explicit null feelings changed: %', main_row->'feelings_row';
  end if;
  if main_row->'latest_analysis_row'->>'id' <> 'analysis-failed-latest'
    or main_row->'last_successful_analysis_row'->>'id' <> 'analysis-success-new' then
    raise exception 'Latest or latest-successful analysis selection changed: %, %', main_row->'latest_analysis_row', main_row->'last_successful_analysis_row';
  end if;
  if main_row->'latest_analysis_row'->>'id' = main_row->'last_successful_analysis_row'->>'id' then
    raise exception 'The same analysis row was returned twice';
  end if;

  select item into empty_row
  from jsonb_array_elements(aggregate_rows) as aggregate_item(item)
  where item->'meal_row'->>'id' = 'meal-empty';
  if empty_row is null then raise exception 'Meal without child data disappeared from the aggregate'; end if;
  if jsonb_array_length(empty_row->'photo_rows') <> 0
    or empty_row->'feelings_row' <> 'null'::jsonb
    or empty_row->'latest_analysis_row' <> 'null'::jsonb
    or empty_row->'last_successful_analysis_row' <> 'null'::jsonb then
    raise exception 'Missing child data was not preserved as empty/null';
  end if;

  select item into success_row
  from jsonb_array_elements(aggregate_rows) as aggregate_item(item)
  where item->'meal_row'->>'id' = 'meal-success-current';
  if success_row->'latest_analysis_row'->>'id' <> 'analysis-success-current'
    or success_row->'last_successful_analysis_row' is distinct from 'null'::jsonb then
    raise exception 'A single newest success should be returned only once: %', success_row;
  end if;

  if has_function_privilege('anon', 'public.soma_meal_list_aggregate(text,text,text)', 'execute')
    or has_function_privilege('authenticated', 'public.soma_meal_list_aggregate(text,text,text)', 'execute')
    or not has_function_privilege('service_role', 'public.soma_meal_list_aggregate(text,text,text)', 'execute') then
    raise exception 'Meal aggregate privileges are too broad or omit service_role';
  end if;
end $$;

rollback;
