-- Run against a disposable Supabase test database, never production.
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password)
values
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'soma-a@example.test', ''),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'soma-b@example.test', '');

insert into public.daily_health_metrics (user_id, metric_date, sleep_minutes)
values
  ('20000000-0000-4000-8000-000000000001', '2026-08-07', 480),
  ('20000000-0000-4000-8000-000000000002', '2026-08-07', 360);

set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000001';

do $$
declare visible_count integer;
begin
  select count(*) into visible_count from public.daily_health_metrics;
  if visible_count <> 1 then
    raise exception 'RLS failure: user A can see % rows instead of 1', visible_count;
  end if;
end $$;

rollback;
