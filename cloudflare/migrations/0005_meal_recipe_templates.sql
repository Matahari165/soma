-- Personal recipe references use the existing lossless JSON-row D1 store.
-- Keep the user's recurring recipe list ordered without introducing a second
-- physical schema for data that remains intentionally soft and variable.
CREATE INDEX IF NOT EXISTS soma_rows_meal_recipe_templates_user_idx
  ON soma_rows(table_name, user_id, updated_at)
  WHERE table_name = 'meal_recipe_templates';
