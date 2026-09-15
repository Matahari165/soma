-- Run in the Supabase SQL editor after production is deployed.
-- Replace both placeholders before running. Vault keeps them out of cron history.
-- This script is safe to run again after rotating the application URL or secret.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  app_url_id uuid;
  cron_secret_id uuid;
begin
  select id into app_url_id from vault.secrets where name = 'soma_app_url';
  if app_url_id is null then
    perform vault.create_secret('https://soma-neon-phi.vercel.app', 'soma_app_url');
  else
    perform vault.update_secret(app_url_id, 'https://soma-neon-phi.vercel.app');
  end if;

  select id into cron_secret_id from vault.secrets where name = 'soma_cron_secret';
  if cron_secret_id is null then
    perform vault.create_secret('REPLACE_WITH_THE_SAME_CRON_SECRET_AS_VERCEL', 'soma_cron_secret');
  else
    perform vault.update_secret(cron_secret_id, 'REPLACE_WITH_THE_SAME_CRON_SECRET_AS_VERCEL');
  end if;
end;
$$;

-- The worker polls for manual/retry work and creates at most one automatic
-- Google Health import for each fifteen-minute slot.
select cron.unschedule(jobid)
from cron.job
where jobname in ('soma-sync-every-five-minutes', 'soma-sync-every-minute', 'soma-sync-worker');

select cron.schedule(
  'soma-sync-worker',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'soma_app_url') || '/api/cron/sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'soma_cron_secret')
    ),
    timeout_milliseconds := 50000
  );
  $$
);
