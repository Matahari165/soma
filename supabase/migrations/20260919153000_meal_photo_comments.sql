-- Optional per-photo context, stored independently from the meal-wide note.
-- Soma's compatibility adapter persists meal_photos as JSON rows, so no
-- destructive rewrite is required for historical photos: missing means null.
create index if not exists soma_rows_meal_photo_comment_idx
  on public.soma_rows(table_name, user_id, ((json_data->>'meal_id')))
  where table_name = 'meal_photos'
    and nullif(btrim(json_data->>'comment'), '') is not null;
