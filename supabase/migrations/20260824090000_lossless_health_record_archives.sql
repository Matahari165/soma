-- Preserve high-volume raw measurements losslessly in private Storage objects.

create table if not exists public.health_record_archives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  data_type text not null,
  range_start timestamptz not null,
  range_end timestamptz not null,
  object_path text not null unique,
  format text not null default 'jsonl+gzip' check (format = 'jsonl+gzip'),
  format_version smallint not null default 1 check (format_version = 1),
  row_count integer not null check (row_count > 0),
  uncompressed_bytes bigint not null check (uncompressed_bytes > 0),
  compressed_bytes bigint not null check (compressed_bytes > 0),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  object_sha256 text not null check (object_sha256 ~ '^[0-9a-f]{64}$'),
  first_source_record_id text not null,
  last_source_record_id text not null,
  verified_at timestamptz not null,
  reclaimed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint health_record_archives_valid_range check (range_end > range_start),
  unique (user_id, provider, data_type, range_start, range_end)
);

create index if not exists health_record_archives_user_range_idx
  on public.health_record_archives (user_id, data_type, range_start);

alter table public.health_record_archives enable row level security;

drop policy if exists health_record_archives_read_own on public.health_record_archives;
create policy health_record_archives_read_own on public.health_record_archives
  for select to authenticated using (auth.uid() = user_id);

revoke insert, update, delete on table public.health_record_archives from public, anon, authenticated;
grant select, insert, update, delete on table public.health_record_archives to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'health-record-archives',
  'health-record-archives',
  false,
  52428800,
  array['application/gzip']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.reclaim_verified_health_archive(p_archive_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_archive public.health_record_archives%rowtype;
  v_live_count integer;
  v_deleted integer;
begin
  select * into v_archive
  from public.health_record_archives
  where id = p_archive_id
  for update;

  if not found then
    raise exception 'Health archive was not found' using errcode = 'P0002';
  end if;

  if v_archive.verified_at is null then
    raise exception 'Health archive has not been verified' using errcode = '22023';
  end if;

  if v_archive.reclaimed_at is not null then
    return 0;
  end if;

  select count(*) into v_live_count
  from public.health_records
  where user_id = v_archive.user_id
    and provider = v_archive.provider
    and data_type = v_archive.data_type
    and measured_at >= v_archive.range_start
    and measured_at < v_archive.range_end;

  if v_live_count <> v_archive.row_count then
    raise exception 'Archive count mismatch: expected %, found %', v_archive.row_count, v_live_count
      using errcode = '22000';
  end if;

  delete from public.health_records
  where user_id = v_archive.user_id
    and provider = v_archive.provider
    and data_type = v_archive.data_type
    and measured_at >= v_archive.range_start
    and measured_at < v_archive.range_end;

  get diagnostics v_deleted = row_count;

  if v_deleted <> v_archive.row_count then
    raise exception 'Archive deletion mismatch: expected %, deleted %', v_archive.row_count, v_deleted
      using errcode = '22000';
  end if;

  update public.health_record_archives
  set reclaimed_at = now()
  where id = v_archive.id;

  return v_deleted;
end;
$$;

revoke all on function public.reclaim_verified_health_archive(uuid) from public, anon, authenticated;
grant execute on function public.reclaim_verified_health_archive(uuid) to service_role;
