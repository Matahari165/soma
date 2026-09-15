-- Cloudflare D1 migration: soma_credentials table for email & password authentication

CREATE TABLE IF NOT EXISTS soma_credentials (
  user_id TEXT PRIMARY KEY REFERENCES soma_users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS soma_credentials_email_idx ON soma_credentials(email);
