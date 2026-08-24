-- The hosted Auth service now persists OAuth context in auth.flow_state.
-- Keep the project schema aligned with Supabase Auth migration 20260115000000.

alter table auth.flow_state
  add column if not exists invite_token text null,
  add column if not exists referrer text null,
  add column if not exists oauth_client_state_id uuid null,
  add column if not exists linking_target_id uuid null,
  add column if not exists email_optional boolean not null default false;

alter table auth.flow_state
  alter column code_challenge drop not null,
  alter column code_challenge_method drop not null,
  alter column auth_code drop not null;

comment on table auth.flow_state is 'Stores metadata for all OAuth/SSO login flows';
