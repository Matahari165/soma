-- Run once in the Supabase SQL editor after production is deployed.
-- Replace both placeholders before running. Vault keeps them out of cron history.

select vault.create_secret('https://YOUR-SOMA-DOMAIN.example', 'soma_app_url');
select vault.create_secret('REPLACE_WITH_THE_SAME_CRON_SECRET_AS_VERCEL', 'soma_cron_secret');

select cron.schedule(
  'soma-sync-every-five-minutes',
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
