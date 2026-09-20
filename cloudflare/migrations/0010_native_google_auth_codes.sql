CREATE TABLE IF NOT EXISTS soma_native_auth_codes (
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'macos')),
  device_name TEXT NOT NULL CHECK (length(device_name) BETWEEN 1 AND 80),
  pkce_challenge TEXT NOT NULL CHECK (length(pkce_challenge) BETWEEN 43 AND 128),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES soma_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS soma_native_auth_codes_expiry_idx
  ON soma_native_auth_codes(expires_at);
