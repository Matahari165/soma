-- Migration: Standalone Email & Password Authentication
-- Invariant: Purely additive. Does NOT touch or alter existing soma_users, existing sessions, or existing user data.

CREATE TABLE IF NOT EXISTS public.soma_credentials (
  user_id TEXT PRIMARY KEY REFERENCES public.soma_users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS soma_credentials_email_idx ON public.soma_credentials(email);

ALTER TABLE public.soma_credentials ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.soma_credentials
  TO service_role;
