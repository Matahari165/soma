-- Merge the legacy 30-minute reading metric into the current 20-minute metric.
--
-- The migration is deliberately conservative: it acts only when a user has
-- exactly one source and one target variable. Existing target entries win on
-- the same date; source entries are otherwise copied with their event date and
-- value intact. Omission markers are moved to the target before the legacy
-- variable and its entries are removed.

WITH source_candidates AS (
  SELECT user_id, json_extract(json_data, '$.id') AS variable_id, row_key
  FROM soma_rows
  WHERE table_name = 'journal_variables'
    AND lower(json_extract(json_data, '$.name')) IN ('reading for 30 min', 'reading for 30 minutes')
), source_counts AS (
  SELECT user_id, COUNT(*) AS variable_count
  FROM source_candidates
  GROUP BY user_id
), target_candidates AS (
  SELECT user_id, json_extract(json_data, '$.id') AS variable_id
  FROM soma_rows
  WHERE table_name = 'journal_variables'
    AND lower(json_extract(json_data, '$.name')) IN ('reading for 20 min', 'reading for 20 minutes')
), target_counts AS (
  SELECT user_id, COUNT(*) AS variable_count
  FROM target_candidates
  GROUP BY user_id
), matched AS (
  SELECT source.user_id,
    source.variable_id AS source_variable_id,
    target.variable_id AS target_variable_id
  FROM source_candidates AS source
  JOIN source_counts AS source_count ON source_count.user_id = source.user_id AND source_count.variable_count = 1
  JOIN target_candidates AS target ON target.user_id = source.user_id
  JOIN target_counts AS target_count ON target_count.user_id = target.user_id AND target_count.variable_count = 1
)
INSERT OR IGNORE INTO soma_rows (table_name, row_key, user_id, json_data, created_at, updated_at)
SELECT
  'journal_entries',
  '%5B%5B%22user_id%22%2C%22' || matched.user_id || '%22%5D%2C%5B%22variable_id%22%2C%22' || matched.target_variable_id || '%22%5D%2C%5B%22entry_date%22%2C%22' || json_extract(source_entry.json_data, '$.entry_date') || '%22%5D%5D',
  source_entry.user_id,
  json_set(source_entry.json_data, '$.variable_id', matched.target_variable_id),
  source_entry.created_at,
  source_entry.updated_at
FROM soma_rows AS source_entry
JOIN matched
  ON matched.user_id = source_entry.user_id
 AND matched.source_variable_id = json_extract(source_entry.json_data, '$.variable_id')
WHERE source_entry.table_name = 'journal_entries'
  AND NOT EXISTS (
    SELECT 1
    FROM soma_rows AS target_entry
    WHERE target_entry.table_name = 'journal_entries'
      AND target_entry.user_id = matched.user_id
      AND json_extract(target_entry.json_data, '$.variable_id') = matched.target_variable_id
      AND json_extract(target_entry.json_data, '$.entry_date') = json_extract(source_entry.json_data, '$.entry_date')
  );

WITH source_candidates AS (
  SELECT user_id, json_extract(json_data, '$.id') AS variable_id
  FROM soma_rows
  WHERE table_name = 'journal_variables'
    AND lower(json_extract(json_data, '$.name')) IN ('reading for 30 min', 'reading for 30 minutes')
), source_counts AS (
  SELECT user_id, COUNT(*) AS variable_count
  FROM source_candidates
  GROUP BY user_id
), target_candidates AS (
  SELECT user_id, json_extract(json_data, '$.id') AS variable_id
  FROM soma_rows
  WHERE table_name = 'journal_variables'
    AND lower(json_extract(json_data, '$.name')) IN ('reading for 20 min', 'reading for 20 minutes')
), target_counts AS (
  SELECT user_id, COUNT(*) AS variable_count
  FROM target_candidates
  GROUP BY user_id
), matched AS (
  SELECT source.user_id,
    source.variable_id AS source_variable_id,
    target.variable_id AS target_variable_id
  FROM source_candidates AS source
  JOIN source_counts AS source_count ON source_count.user_id = source.user_id AND source_count.variable_count = 1
  JOIN target_candidates AS target ON target.user_id = source.user_id
  JOIN target_counts AS target_count ON target_count.user_id = target.user_id AND target_count.variable_count = 1
)
UPDATE soma_rows AS day
SET json_data = json_set(
      day.json_data,
      '$.omitted_variables',
      json((
        SELECT json_group_array(mapped.variable_id)
        FROM (
          SELECT DISTINCT CASE
            WHEN omitted.value = matched.source_variable_id THEN matched.target_variable_id
            ELSE omitted.value
          END AS variable_id
          FROM json_each(day.json_data, '$.omitted_variables') AS omitted
        ) AS mapped
      )),
      '$.updated_at', datetime('now')
    ),
    updated_at = datetime('now')
FROM matched
WHERE day.table_name = 'journal_days'
  AND day.user_id = matched.user_id
  AND EXISTS (
    SELECT 1
    FROM json_each(day.json_data, '$.omitted_variables') AS omitted
    WHERE omitted.value = matched.source_variable_id
  );

WITH source_candidates AS (
  SELECT user_id, json_extract(json_data, '$.id') AS variable_id
  FROM soma_rows
  WHERE table_name = 'journal_variables'
    AND lower(json_extract(json_data, '$.name')) IN ('reading for 30 min', 'reading for 30 minutes')
), source_counts AS (
  SELECT user_id, COUNT(*) AS variable_count
  FROM source_candidates
  GROUP BY user_id
), target_candidates AS (
  SELECT user_id, json_extract(json_data, '$.id') AS variable_id
  FROM soma_rows
  WHERE table_name = 'journal_variables'
    AND lower(json_extract(json_data, '$.name')) IN ('reading for 20 min', 'reading for 20 minutes')
), target_counts AS (
  SELECT user_id, COUNT(*) AS variable_count
  FROM target_candidates
  GROUP BY user_id
), matched_users AS (
  SELECT source.user_id
  FROM source_candidates AS source
  JOIN source_counts AS source_count ON source_count.user_id = source.user_id AND source_count.variable_count = 1
  JOIN target_candidates AS target ON target.user_id = source.user_id
  JOIN target_counts AS target_count ON target_count.user_id = target.user_id AND target_count.variable_count = 1
  GROUP BY source.user_id
)
UPDATE soma_rows AS revision
SET json_data = json_set(revision.json_data, '$.revision', COALESCE(CAST(json_extract(revision.json_data, '$.revision') AS INTEGER), 0) + 1, '$.updated_at', datetime('now')),
    updated_at = datetime('now')
FROM matched_users
WHERE revision.table_name = 'lab_matrix_revisions'
  AND revision.row_key = matched_users.user_id;

WITH source_candidates AS (
  SELECT user_id
  FROM soma_rows
  WHERE table_name = 'journal_variables'
    AND lower(json_extract(json_data, '$.name')) IN ('reading for 30 min', 'reading for 30 minutes')
), target_candidates AS (
  SELECT user_id
  FROM soma_rows
  WHERE table_name = 'journal_variables'
    AND lower(json_extract(json_data, '$.name')) IN ('reading for 20 min', 'reading for 20 minutes')
), matched_users AS (
  SELECT source.user_id
  FROM source_candidates AS source
  JOIN target_candidates AS target ON target.user_id = source.user_id
  GROUP BY source.user_id
)
INSERT OR IGNORE INTO soma_rows (table_name, row_key, user_id, json_data, created_at, updated_at)
SELECT
  'lab_matrix_revisions',
  matched_users.user_id,
  matched_users.user_id,
  json_object('user_id', matched_users.user_id, 'revision', 1, 'updated_at', datetime('now')),
  datetime('now'),
  datetime('now')
FROM matched_users;

WITH source_candidates AS (
  SELECT user_id, json_extract(json_data, '$.id') AS variable_id
  FROM soma_rows
  WHERE table_name = 'journal_variables'
    AND lower(json_extract(json_data, '$.name')) IN ('reading for 30 min', 'reading for 30 minutes')
), source_counts AS (
  SELECT user_id, COUNT(*) AS variable_count
  FROM source_candidates
  GROUP BY user_id
), target_candidates AS (
  SELECT user_id, json_extract(json_data, '$.id') AS variable_id
  FROM soma_rows
  WHERE table_name = 'journal_variables'
    AND lower(json_extract(json_data, '$.name')) IN ('reading for 20 min', 'reading for 20 minutes')
), target_counts AS (
  SELECT user_id, COUNT(*) AS variable_count
  FROM target_candidates
  GROUP BY user_id
), matched AS (
  SELECT source.user_id, source.variable_id AS source_variable_id
  FROM source_candidates AS source
  JOIN source_counts AS source_count ON source_count.user_id = source.user_id AND source_count.variable_count = 1
  JOIN target_candidates AS target ON target.user_id = source.user_id
  JOIN target_counts AS target_count ON target_count.user_id = target.user_id AND target_count.variable_count = 1
)
DELETE FROM soma_rows
WHERE table_name = 'journal_entries'
  AND EXISTS (
    SELECT 1
    FROM matched
    WHERE matched.user_id = soma_rows.user_id
      AND matched.source_variable_id = json_extract(soma_rows.json_data, '$.variable_id')
  );

WITH source_candidates AS (
  SELECT user_id, row_key, json_extract(json_data, '$.id') AS variable_id
  FROM soma_rows
  WHERE table_name = 'journal_variables'
    AND lower(json_extract(json_data, '$.name')) IN ('reading for 30 min', 'reading for 30 minutes')
), source_counts AS (
  SELECT user_id, COUNT(*) AS variable_count
  FROM source_candidates
  GROUP BY user_id
), target_candidates AS (
  SELECT user_id
  FROM soma_rows
  WHERE table_name = 'journal_variables'
    AND lower(json_extract(json_data, '$.name')) IN ('reading for 20 min', 'reading for 20 minutes')
), target_counts AS (
  SELECT user_id, COUNT(*) AS variable_count
  FROM target_candidates
  GROUP BY user_id
)
DELETE FROM soma_rows
WHERE table_name = 'journal_variables'
  AND EXISTS (
    SELECT 1
    FROM source_candidates AS source
    JOIN source_counts AS source_count ON source_count.user_id = source.user_id AND source_count.variable_count = 1
    JOIN target_counts AS target_count ON target_count.user_id = source.user_id AND target_count.variable_count = 1
    WHERE source.row_key = soma_rows.row_key
  );
