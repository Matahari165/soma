-- Meal entries, photos, feelings and analyses are lossless JSON rows just
-- like the other Soma product domains. These expression indexes keep the
-- mobile journal queries bounded without creating a second data model.
CREATE INDEX IF NOT EXISTS soma_rows_meals_user_date_idx
  ON soma_rows(table_name, user_id, json_extract(json_data, '$.meal_date'))
  WHERE table_name = 'meals';

CREATE INDEX IF NOT EXISTS soma_rows_meals_user_type_idx
  ON soma_rows(table_name, user_id, json_extract(json_data, '$.meal_type'))
  WHERE table_name = 'meals';

-- A user can have at most one meal per calendar slot. The service also uses
-- an insert-or-ignore keyed by these same fields, but this constraint protects
-- direct/replayed writes and concurrent requests at the database boundary.
CREATE UNIQUE INDEX IF NOT EXISTS soma_rows_meals_user_slot_unique_idx
  ON soma_rows(table_name, user_id, json_extract(json_data, '$.meal_date'), json_extract(json_data, '$.meal_type'))
  WHERE table_name = 'meals';

CREATE INDEX IF NOT EXISTS soma_rows_meal_photos_user_meal_idx
  ON soma_rows(table_name, user_id, json_extract(json_data, '$.meal_id'))
  WHERE table_name = 'meal_photos';

CREATE INDEX IF NOT EXISTS soma_rows_meal_analyses_user_meal_idx
  ON soma_rows(table_name, user_id, json_extract(json_data, '$.meal_id'), json_extract(json_data, '$.created_at'))
  WHERE table_name = 'meal_analyses';

CREATE INDEX IF NOT EXISTS soma_rows_meal_idempotency_idx
  ON soma_rows(table_name, user_id, json_extract(json_data, '$.idempotency_key'))
  WHERE table_name = 'meals' AND json_extract(json_data, '$.idempotency_key') IS NOT NULL;
