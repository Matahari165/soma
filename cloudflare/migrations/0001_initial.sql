PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS soma_users (
  id TEXT PRIMARY KEY,
  google_subject TEXT NOT NULL UNIQUE,
  email TEXT,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS soma_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES soma_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS soma_sessions_user_idx ON soma_sessions(user_id);
CREATE INDEX IF NOT EXISTS soma_sessions_expiry_idx ON soma_sessions(expires_at);

-- Soma's product tables are kept as lossless JSON rows. This preserves nested
-- health payloads while D1 indexes the table, owner and timestamps used by the app.
CREATE TABLE IF NOT EXISTS soma_rows (
  table_name TEXT NOT NULL,
  row_key TEXT NOT NULL,
  user_id TEXT,
  json_data TEXT NOT NULL CHECK (json_valid(json_data)),
  created_at TEXT,
  updated_at TEXT,
  PRIMARY KEY (table_name, row_key)
);

CREATE INDEX IF NOT EXISTS soma_rows_table_user_idx ON soma_rows(table_name, user_id);
CREATE INDEX IF NOT EXISTS soma_rows_user_idx ON soma_rows(user_id);
CREATE INDEX IF NOT EXISTS soma_rows_updated_idx ON soma_rows(table_name, updated_at);
