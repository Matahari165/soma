-- Meal analysis v2 and photo retention use the existing lossless JSON rows.
-- These indexes keep purge retries and latest analysis reads bounded without
-- duplicating the nested nutrition document into a second schema.
CREATE INDEX IF NOT EXISTS soma_rows_meal_photos_storage_idx
  ON soma_rows(table_name, user_id, json_extract(json_data, '$.meal_id'), json_extract(json_data, '$.storage_status'))
  WHERE table_name = 'meal_photos';

CREATE INDEX IF NOT EXISTS soma_rows_meal_analyses_status_idx
  ON soma_rows(table_name, user_id, json_extract(json_data, '$.meal_id'), json_extract(json_data, '$.status'), json_extract(json_data, '$.created_at'))
  WHERE table_name = 'meal_analyses';
