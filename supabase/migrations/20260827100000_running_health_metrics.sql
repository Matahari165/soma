-- Daily running metrics used by the Personal Lab relation matrix.

alter table public.daily_health_metrics
  add column if not exists running_distance_km numeric(10,2),
  add column if not exists running_duration_minutes numeric(8,2),
  add column if not exists running_pace_seconds_per_km numeric(10,2),
  add column if not exists running_average_heart_rate numeric(6,2);
