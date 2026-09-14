-- Durable XAI meal-analysis jobs.
-- The logical row keeps the queue state, immutable source snapshot and worker
-- lease in JSON so the Cloudflare and Supabase adapters share one contract.

CREATE INDEX IF NOT EXISTS soma_rows_meal_analysis_queue_idx
  ON soma_rows(
    table_name,
    json_extract(json_data, '$.status'),
    json_extract(json_data, '$.heartbeat_at'),
    json_extract(json_data, '$.created_at')
  )
  WHERE table_name = 'meal_analyses';

CREATE UNIQUE INDEX IF NOT EXISTS soma_rows_meal_analysis_request_uidx
  ON soma_rows(
    table_name,
    user_id,
    json_extract(json_data, '$.analysis_request_id')
  )
  WHERE table_name = 'meal_analyses'
    AND json_extract(json_data, '$.analysis_request_id') IS NOT NULL;
