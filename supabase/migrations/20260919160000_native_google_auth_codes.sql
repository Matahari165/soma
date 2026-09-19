create table if not exists public.soma_native_auth_codes (
  code_hash text primary key,
  user_id text not null references public.soma_users(id) on delete cascade,
  platform text not null check (platform in ('ios', 'macos')),
  device_name text not null check (char_length(device_name) between 1 and 80),
  pkce_challenge text not null check (char_length(pkce_challenge) between 43 and 128),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists soma_native_auth_codes_expiry_idx
  on public.soma_native_auth_codes(expires_at);

alter table public.soma_native_auth_codes enable row level security;
revoke all on table public.soma_native_auth_codes from anon, authenticated;
grant all on table public.soma_native_auth_codes to service_role;
