alter table public.soma_sessions
  add column if not exists session_id text default gen_random_uuid()::text,
  add column if not exists platform text default 'web',
  add column if not exists device_name text default 'Web browser';

update public.soma_sessions
set session_id = gen_random_uuid()::text
where session_id is null;

update public.soma_sessions
set platform = 'web', device_name = 'Web browser'
where platform is null or device_name is null;

alter table public.soma_sessions
  alter column session_id set not null,
  alter column platform set not null,
  alter column device_name set not null;

create unique index if not exists soma_sessions_session_id_idx
  on public.soma_sessions(session_id);

alter table public.soma_sessions
  drop constraint if exists soma_sessions_platform_check;

alter table public.soma_sessions
  add constraint soma_sessions_platform_check
  check (platform in ('web', 'ios', 'macos'));

alter table public.soma_sessions
  drop constraint if exists soma_sessions_device_name_check;

alter table public.soma_sessions
  add constraint soma_sessions_device_name_check
  check (char_length(device_name) between 1 and 80);
