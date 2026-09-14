-- Durable XAI meal-analysis jobs.
-- The application stores the queue state, immutable source snapshot and worker
-- lease in json_data to keep the Supabase and D1 adapters compatible.

create index if not exists soma_rows_meal_analysis_queue_idx
  on public.soma_rows(
    table_name,
    ((json_data->>'status')),
    ((json_data->>'heartbeat_at')),
    ((json_data->>'created_at'))
  )
  where table_name = 'meal_analyses';

create unique index if not exists soma_rows_meal_analysis_request_uidx
  on public.soma_rows(
    table_name,
    user_id,
    ((json_data->>'analysis_request_id'))
  )
  where table_name = 'meal_analyses'
    and json_data->>'analysis_request_id' is not null;
