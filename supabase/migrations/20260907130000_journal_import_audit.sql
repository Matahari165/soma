-- Keep a private, recoverable snapshot of a user-approved journal import.
-- The source is never used as a live second journal: journal_entries remains
-- the canonical data used by Soma's analysis and achievement calculations.
create table if not exists public.journal_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_kind text not null check (source_kind = 'google_sheets'),
  source_spreadsheet_id text not null,
  source_sheet_name text not null check (source_sheet_name = 'Goose'),
  source_headers jsonb not null default '[]'::jsonb,
  source_targets jsonb not null default '[]'::jsonb,
  source_rows jsonb not null default '[]'::jsonb,
  mapping jsonb not null default '[]'::jsonb,
  conflict_resolutions jsonb not null default '{}'::jsonb,
  status text not null check (status in ('started', 'completed', 'failed')),
  statistics jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists journal_imports_user_created_idx
  on public.journal_imports (user_id, created_at desc);

alter table public.journal_imports enable row level security;

create policy journal_imports_owner on public.journal_imports
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update on public.journal_imports to authenticated;
grant select, insert, update, delete on public.journal_imports to service_role;
