-- Run only on an isolated database after the migration; all fixture writes roll back.
begin;
insert into public.soma_users(id,google_subject,display_name,created_at,updated_at) values
('aggregate-fixture','aggregate-fixture','Synthetic fixture',now(),now()),
('aggregate-other','aggregate-other','Synthetic fixture',now(),now());
insert into public.soma_rows(table_name, row_key, user_id, json_data) values
('profiles', 'aggregate-fixture-profile', 'aggregate-fixture', '{"timezone":"Europe/Paris"}'),
('health_records', 'aggregate-fixture-1', 'aggregate-fixture', '{"data_type":"sleep","civil_date":"2026-01-01","source_device":"Whoop","provider":"whoop_export"}'),
('health_records', 'aggregate-fixture-2', 'aggregate-fixture', '{"data_type":"sleep","civil_date":"2026-01-01","payload":{"dataSource":{"application":{"packageName":"com.whoop"}}}}'),
('health_records', 'aggregate-fixture-3', 'aggregate-fixture', '{"data_type":"steps","civil_date":"2025-12-31"}'),
('health_records', 'aggregate-fixture-4', 'aggregate-fixture', '{"data_type":"sleep","end_time":"2026-01-02T23:30:00Z","source_device":"Other Watch","measured_at":"2026-01-03T00:00:00Z"}'),
('health_records', 'aggregate-fixture-5', 'aggregate-fixture', '{"data_type":"sleep","civil_date":"2026-01-04","source_device":"Whoop","provider":"whoop_export"}'),
('health_records', 'aggregate-fixture-6', 'aggregate-other', '{"data_type":"sleep","civil_date":"2020-01-01"}'),
('daily_health_metrics', 'aggregate-fixture-m1', 'aggregate-fixture', '{"metric_date":"2026-01-01","sleep_minutes":0}'),
('daily_health_metrics', 'aggregate-fixture-m2', 'aggregate-fixture', '{"metric_date":"2026-01-03","sleep_minutes":null}'),
('daily_scores', 'aggregate-fixture-s1', 'aggregate-fixture', '{}');
do $$
declare c record; d jsonb; l record; before_revision uuid;
begin
  select * into c from public.soma_health_data_coverage('aggregate-fixture', array['sleep','steps']);
  if c.status <> 'incomplete' or c."importedDays" <> 2 or c."usedDays" <> 2
    or c."importedNights" <> 2 or c."usedNights" <> 1
    or c."missingDays" <> 0 or c."missingNights" <> 1
    or c."startDate" <> '2026-01-01' or c."endDate" <> '2026-01-03' then
    raise exception 'Coverage wearable/timezone/null semantics changed: %', row_to_json(c);
  end if;
  select * into c from public.soma_health_data_coverage('aggregate-empty', array['sleep']);
  if c.status <> 'empty' or c."importedDays" <> 0 or c."startDate" is not null then raise exception 'Empty coverage changed'; end if;
  d := public.soma_health_sync_diagnostics('aggregate-fixture', array['sleep','absent']);
  if d #>> '{importedRecords,sleep}' <> '4' or d #>> '{importedRecords,absent}' <> '0'
    or d #>> '{analytics,datedRecords}' <> '4' or d #>> '{analytics,metricDays}' <> '2'
    or d #>> '{analytics,scoreRows}' <> '1' then raise exception 'Diagnostics changed: %', d; end if;
  select * into l from public.soma_latest_health_records('aggregate-fixture', array['sleep']);
  if l.civil_date <> '2026-01-04' then raise exception 'Latest record order changed'; end if;
  if exists (select 1 from public.soma_latest_health_records('aggregate-fixture', array[]::text[])) then raise exception 'Empty latest types changed'; end if;
  select revision into before_revision from public.soma_lab_matrix_revisions where user_id = 'aggregate-fixture';
  insert into public.soma_rows(table_name,row_key,user_id,json_data) values ('nutrition_targets','aggregate-fixture-target','aggregate-fixture','{"calories":2000}');
  if before_revision = (select revision from public.soma_lab_matrix_revisions where user_id = 'aggregate-fixture') then raise exception 'Nutrition targets did not invalidate matrix'; end if;
  if has_function_privilege('anon', 'public.soma_health_data_coverage(text,text[])', 'execute')
    or has_function_privilege('authenticated', 'public.soma_health_sync_diagnostics(text,text[])', 'execute') then
    raise exception 'Read aggregates exposed to browser roles';
  end if;
end $$;
rollback;
