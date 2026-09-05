-- Keep nutrition target lookups bounded in the JSON-row D1 compatibility store.
CREATE INDEX IF NOT EXISTS soma_rows_nutrition_targets_user_idx
  ON soma_rows(table_name, user_id, updated_at)
  WHERE table_name = 'nutrition_targets';
