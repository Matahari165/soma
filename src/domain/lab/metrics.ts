export const metricRoles = ["influence", "result", "both", "disabled"] as const;
export type MetricRole = (typeof metricRoles)[number];

const resultOnlyMetricIds = new Set(["sleep_minutes"]);

export type LabMetricDefinition = {
  id: string;
  label: string;
  unit: string;
  field: string;
  defaultRole: MetricRole;
  direction: "higher" | "lower" | "target";
  source: "Google Health" | "Soma";
};

export const healthMetricRegistry: readonly LabMetricDefinition[] = [
  { id: "sleep_minutes", label: "Sleep duration", unit: "min", field: "sleep_minutes", defaultRole: "result", direction: "target", source: "Google Health" },
  { id: "sleep_need", label: "Estimated sleep need", unit: "min", field: "sleep_need_minutes", defaultRole: "disabled", direction: "target", source: "Soma" },
  { id: "sleep_efficiency", label: "Sleep efficiency", unit: "%", field: "sleep_efficiency", defaultRole: "result", direction: "higher", source: "Google Health" },
  { id: "sleep_latency", label: "Sleep latency", unit: "min", field: "sleep_latency_minutes", defaultRole: "result", direction: "lower", source: "Google Health" },
  { id: "sleep_awake", label: "Awake time", unit: "min", field: "sleep_awake_minutes", defaultRole: "result", direction: "lower", source: "Google Health" },
  { id: "sleep_awake_percent", label: "Awake share", unit: "%", field: "sleep_awake_percent", defaultRole: "disabled", direction: "lower", source: "Google Health" },
  { id: "sleep_awakenings", label: "Awakenings", unit: "count", field: "sleep_awakenings", defaultRole: "result", direction: "lower", source: "Google Health" },
  { id: "sleep_fragmentation", label: "Fragmentation", unit: "/h", field: "sleep_fragmentation", defaultRole: "result", direction: "lower", source: "Google Health" },
  { id: "deep_sleep", label: "Deep sleep", unit: "min", field: "sleep_deep_minutes", defaultRole: "result", direction: "higher", source: "Google Health" },
  { id: "deep_sleep_percent", label: "Deep sleep share", unit: "%", field: "sleep_deep_percent", defaultRole: "disabled", direction: "higher", source: "Google Health" },
  { id: "rem_sleep", label: "REM sleep", unit: "min", field: "sleep_rem_minutes", defaultRole: "result", direction: "higher", source: "Google Health" },
  { id: "rem_sleep_percent", label: "REM sleep share", unit: "%", field: "sleep_rem_percent", defaultRole: "disabled", direction: "higher", source: "Google Health" },
  { id: "light_sleep", label: "Light sleep", unit: "min", field: "sleep_light_minutes", defaultRole: "disabled", direction: "target", source: "Google Health" },
  { id: "light_sleep_percent", label: "Light sleep share", unit: "%", field: "sleep_light_percent", defaultRole: "disabled", direction: "target", source: "Google Health" },
  { id: "hrv", label: "HRV", unit: "ms", field: "hrv_ms", defaultRole: "result", direction: "higher", source: "Google Health" },
  { id: "rhr", label: "Resting heart rate", unit: "bpm", field: "resting_heart_rate", defaultRole: "result", direction: "lower", source: "Google Health" },
  { id: "respiratory", label: "Respiratory rate", unit: "/min", field: "respiratory_rate", defaultRole: "result", direction: "target", source: "Google Health" },
  { id: "spo2", label: "Oxygen saturation", unit: "%", field: "oxygen_saturation", defaultRole: "result", direction: "higher", source: "Google Health" },
  { id: "spo2_low", label: "Oxygen saturation low", unit: "%", field: "oxygen_saturation_lower", defaultRole: "disabled", direction: "higher", source: "Google Health" },
  { id: "spo2_high", label: "Oxygen saturation high", unit: "%", field: "oxygen_saturation_upper", defaultRole: "disabled", direction: "higher", source: "Google Health" },
  { id: "bedtime", label: "Bedtime", unit: "min", field: "bedtime", defaultRole: "influence", direction: "target", source: "Google Health" },
  { id: "wake_time", label: "Wake time", unit: "min", field: "wake_time", defaultRole: "influence", direction: "target", source: "Google Health" },
  { id: "sleep_regularity", label: "Sleep regularity", unit: "%", field: "sleep_regularity", defaultRole: "influence", direction: "higher", source: "Google Health" },
  { id: "sleep_debt", label: "Sleep debt", unit: "min", field: "cumulative_sleep_debt_minutes", defaultRole: "influence", direction: "lower", source: "Google Health" },
  { id: "daily_sleep_debt", label: "Daily sleep gap", unit: "min", field: "daily_sleep_debt_minutes", defaultRole: "disabled", direction: "lower", source: "Soma" },
  { id: "steps", label: "Steps", unit: "steps", field: "steps", defaultRole: "influence", direction: "higher", source: "Google Health" },
  { id: "zone_minutes", label: "Zone minutes", unit: "min", field: "zone_minutes", defaultRole: "influence", direction: "higher", source: "Google Health" },
  { id: "light_zone_minutes", label: "Light-zone minutes", unit: "min", field: "light_zone_minutes", defaultRole: "disabled", direction: "higher", source: "Google Health" },
  { id: "moderate_zone_minutes", label: "Moderate-zone minutes", unit: "min", field: "moderate_zone_minutes", defaultRole: "disabled", direction: "higher", source: "Google Health" },
  { id: "vigorous_zone_minutes", label: "Vigorous-zone minutes", unit: "min", field: "vigorous_zone_minutes", defaultRole: "disabled", direction: "higher", source: "Google Health" },
  { id: "peak_zone_minutes", label: "Peak-zone minutes", unit: "min", field: "peak_zone_minutes", defaultRole: "disabled", direction: "higher", source: "Google Health" },
  { id: "intense_minutes", label: "Intense-zone minutes", unit: "min", field: "vigorous_zone_minutes", defaultRole: "influence", direction: "higher", source: "Google Health" },
  { id: "active_minutes", label: "Active minutes", unit: "min", field: "active_minutes", defaultRole: "influence", direction: "higher", source: "Google Health" },
  { id: "exercise_minutes", label: "Exercise minutes", unit: "min", field: "exercise_minutes", defaultRole: "influence", direction: "higher", source: "Google Health" },
  { id: "skin_temperature", label: "Skin temperature delta", unit: "°C", field: "skin_temperature_delta", defaultRole: "disabled", direction: "target", source: "Google Health" },
  { id: "night_temperature", label: "Night temperature", unit: "°C", field: "nightly_temperature_celsius", defaultRole: "disabled", direction: "target", source: "Google Health" },
  { id: "baseline_temperature", label: "Baseline temperature", unit: "°C", field: "baseline_temperature_celsius", defaultRole: "disabled", direction: "target", source: "Google Health" },
  { id: "active_energy", label: "Active energy", unit: "kcal", field: "active_energy_kcal", defaultRole: "disabled", direction: "higher", source: "Google Health" },
  { id: "total_energy", label: "Total energy", unit: "kcal", field: "total_energy_kcal", defaultRole: "disabled", direction: "higher", source: "Google Health" },
  { id: "sedentary_minutes", label: "Sedentary minutes", unit: "min", field: "sedentary_minutes", defaultRole: "disabled", direction: "lower", source: "Google Health" },
  { id: "distance", label: "Distance", unit: "km", field: "distance_km", defaultRole: "disabled", direction: "higher", source: "Google Health" },
  { id: "floors", label: "Floors", unit: "floors", field: "floors", defaultRole: "disabled", direction: "higher", source: "Google Health" },
  { id: "weight", label: "Weight", unit: "kg", field: "weight_kg", defaultRole: "disabled", direction: "target", source: "Google Health" },
  { id: "body_fat", label: "Body fat", unit: "%", field: "body_fat_percent", defaultRole: "disabled", direction: "target", source: "Google Health" },
  { id: "vo2_max", label: "VO₂ max", unit: "ml/kg/min", field: "vo2_max", defaultRole: "disabled", direction: "higher", source: "Google Health" },
  { id: "altitude_gain", label: "Altitude gain", unit: "m", field: "altitude_gain_m", defaultRole: "disabled", direction: "higher", source: "Google Health" },
  { id: "height", label: "Height", unit: "cm", field: "height_cm", defaultRole: "disabled", direction: "target", source: "Google Health" },
  { id: "core_temperature", label: "Core temperature", unit: "°C", field: "core_body_temperature_celsius", defaultRole: "disabled", direction: "target", source: "Google Health" },
  { id: "blood_glucose", label: "Blood glucose", unit: "mg/dL", field: "blood_glucose_mg_dl", defaultRole: "disabled", direction: "target", source: "Google Health" },
  { id: "active_day", label: "Active day", unit: "yes/no", field: "active_day", defaultRole: "disabled", direction: "higher", source: "Soma" },
  { id: "active_day_rate", label: "Active-day rate", unit: "%", field: "active_day_rate_28d", defaultRole: "disabled", direction: "higher", source: "Soma" },
  { id: "activity_consistency", label: "Activity consistency", unit: "%", field: "activity_consistency_28d", defaultRole: "disabled", direction: "higher", source: "Soma" },
  { id: "weekly_load", label: "Weekly load", unit: "pts", field: "weekly_load", defaultRole: "disabled", direction: "target", source: "Soma" },
  { id: "load_ratio", label: "Acute / chronic load", unit: "ratio", field: "acute_chronic_load_ratio", defaultRole: "disabled", direction: "target", source: "Soma" },
  { id: "recovery", label: "Recovery", unit: "pts", field: "recovery_score", defaultRole: "result", direction: "higher", source: "Soma" },
  { id: "effort", label: "Effort", unit: "pts", field: "effort_score", defaultRole: "influence", direction: "target", source: "Soma" },
] as const;

export function metricRoleFor(id: string, preferences: ReadonlyMap<string, MetricRole>) {
  if (resultOnlyMetricIds.has(id)) return "result" as const;
  return preferences.get(id) ?? healthMetricRegistry.find((metric) => metric.id === id)?.defaultRole ?? "disabled";
}

export function isResultOnlyMetric(id: string) {
  return resultOnlyMetricIds.has(id);
}

const administrativeFields = new Set(["user_id", "metric_date", "data_quality", "source_freshness", "algorithm_input_version", "created_at", "updated_at"]);

export function metricDefinitionsForHealth(rows: ReadonlyArray<Record<string, unknown>>): LabMetricDefinition[] {
  const knownFields = new Set(healthMetricRegistry.map((metric) => metric.field));
  const unknown = [...new Set(rows.flatMap((row) => Object.keys(row)))]
    .filter((field) => !administrativeFields.has(field) && !knownFields.has(field))
    .filter((field) => rows.some((row) => typeof row[field] === "number" || typeof row[field] === "boolean"))
    .map((field): LabMetricDefinition => ({
      id: field,
      label: field.split("_").map((part) => part ? part[0].toUpperCase() + part.slice(1) : "").join(" "),
      unit: "",
      field,
      defaultRole: "disabled",
      direction: "target",
      source: "Google Health",
    }));
  return [...healthMetricRegistry, ...unknown];
}
