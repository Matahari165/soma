-- Rich Google Health metrics used by the detailed Soma analytics pages.

alter table public.daily_health_metrics
  add column if not exists sleep_latency_minutes numeric(8,2),
  add column if not exists sleep_awake_minutes numeric(8,2),
  add column if not exists sleep_awake_percent numeric(5,2),
  add column if not exists sleep_awakenings numeric(8,2),
  add column if not exists sleep_fragmentation numeric(8,2),
  add column if not exists sleep_deep_minutes numeric(8,2),
  add column if not exists sleep_deep_percent numeric(5,2),
  add column if not exists sleep_rem_minutes numeric(8,2),
  add column if not exists sleep_rem_percent numeric(5,2),
  add column if not exists sleep_light_minutes numeric(8,2),
  add column if not exists sleep_light_percent numeric(5,2),
  add column if not exists oxygen_saturation_lower numeric(5,2),
  add column if not exists oxygen_saturation_upper numeric(5,2),
  add column if not exists nightly_temperature_celsius numeric(6,2),
  add column if not exists baseline_temperature_celsius numeric(6,2),
  add column if not exists total_energy_kcal numeric(10,2),
  add column if not exists light_zone_minutes numeric(8,2),
  add column if not exists moderate_zone_minutes numeric(8,2),
  add column if not exists vigorous_zone_minutes numeric(8,2),
  add column if not exists peak_zone_minutes numeric(8,2),
  add column if not exists active_minutes numeric(8,2),
  add column if not exists sedentary_minutes numeric(8,2),
  add column if not exists distance_km numeric(10,2),
  add column if not exists floors numeric(8,2),
  add column if not exists weight_kg numeric(8,2),
  add column if not exists body_fat_percent numeric(5,2),
  add column if not exists vo2_max numeric(8,2);

alter table public.daily_health_metrics
  add column if not exists altitude_gain_m numeric(10,2),
  add column if not exists height_cm numeric(8,2),
  add column if not exists core_body_temperature_celsius numeric(6,2),
  add column if not exists blood_glucose_mg_dl numeric(8,2);

alter table public.daily_health_metrics
  add column if not exists daily_sleep_debt_minutes numeric(8,2),
  add column if not exists cumulative_sleep_debt_minutes numeric(8,2),
  add column if not exists active_day boolean,
  add column if not exists active_day_rate_28d numeric(5,2),
  add column if not exists activity_consistency_28d numeric(5,2),
  add column if not exists weekly_load numeric(10,2),
  add column if not exists acute_chronic_load_ratio numeric(6,3);

comment on column public.daily_health_metrics.sleep_fragmentation is
  'Awake stage segments per hour of measured sleep; a wellness signal, not a diagnosis.';

comment on column public.daily_health_metrics.source_freshness is
  'Latest source measurement timestamp. Missing values must never be converted to zero.';
