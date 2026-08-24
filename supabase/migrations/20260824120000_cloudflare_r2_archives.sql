-- Track whether each lossless archive lives in Supabase Storage or Cloudflare R2.

alter table public.health_record_archives
  add column if not exists storage_backend text not null default 'supabase',
  add column if not exists storage_bucket text not null default 'health-record-archives';

alter table public.health_record_archives
  drop constraint if exists health_record_archives_storage_backend_check;

alter table public.health_record_archives
  add constraint health_record_archives_storage_backend_check
  check (storage_backend in ('supabase', 'r2'));

create index if not exists health_record_archives_storage_backend_idx
  on public.health_record_archives (storage_backend, range_start);
