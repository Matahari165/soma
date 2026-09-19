ALTER TABLE soma_sessions ADD COLUMN session_id TEXT;
ALTER TABLE soma_sessions ADD COLUMN platform TEXT DEFAULT 'web';
ALTER TABLE soma_sessions ADD COLUMN device_name TEXT DEFAULT 'Web browser';

UPDATE soma_sessions
SET session_id = lower(
      substr(hex(randomblob(16)), 1, 8) || '-' ||
      substr(hex(randomblob(16)), 1, 4) || '-4' ||
      substr(hex(randomblob(16)), 1, 3) || '-a' ||
      substr(hex(randomblob(16)), 1, 3) || '-' ||
      substr(hex(randomblob(16)), 1, 12)
    ),
    platform = 'web',
    device_name = 'Web browser'
WHERE session_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS soma_sessions_session_id_idx ON soma_sessions(session_id);

CREATE TRIGGER IF NOT EXISTS soma_sessions_native_fields_backfill_insert
AFTER INSERT ON soma_sessions
WHEN NEW.session_id IS NULL
BEGIN
  UPDATE soma_sessions
  SET session_id = lower(
        substr(hex(randomblob(16)), 1, 8) || '-' ||
        substr(hex(randomblob(16)), 1, 4) || '-4' ||
        substr(hex(randomblob(16)), 1, 3) || '-a' ||
        substr(hex(randomblob(16)), 1, 3) || '-' ||
        substr(hex(randomblob(16)), 1, 12)
      )
  WHERE token_hash = NEW.token_hash;
END;

CREATE TRIGGER IF NOT EXISTS soma_sessions_native_fields_insert
BEFORE INSERT ON soma_sessions
WHEN NEW.session_id IS NOT NULL
  AND (NEW.platform IS NULL
  OR NEW.platform NOT IN ('web', 'ios', 'macos')
  OR NEW.device_name IS NULL
  OR length(NEW.device_name) NOT BETWEEN 1 AND 80)
BEGIN
  SELECT RAISE(ABORT, 'invalid session metadata');
END;

CREATE TRIGGER IF NOT EXISTS soma_sessions_native_fields_update
BEFORE UPDATE OF session_id, platform, device_name ON soma_sessions
WHEN NEW.session_id IS NULL
  OR NEW.platform IS NULL
  OR NEW.platform NOT IN ('web', 'ios', 'macos')
  OR NEW.device_name IS NULL
  OR length(NEW.device_name) NOT BETWEEN 1 AND 80
BEGIN
  SELECT RAISE(ABORT, 'invalid session metadata');
END;
