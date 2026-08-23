alter table public.provider_connections
  add column if not exists last_lab_synced_at timestamptz;

comment on column public.provider_connections.last_lab_synced_at is
  'Completion time of the latest Google Health import that refreshed Lab metrics. Webhook-only imports do not update this value.';
