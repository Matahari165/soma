import { healthMetricRegistry } from "@/domain/lab/metrics";

export const assistantHealthMetricFields = [
  "sleep_minutes", "sleep_need_minutes", "sleep_efficiency", "sleep_regularity", "sleep_latency_minutes",
  "sleep_awake_minutes", "sleep_awake_percent", "sleep_awakenings", "sleep_fragmentation", "sleep_deep_minutes",
  "sleep_deep_percent", "sleep_rem_minutes", "sleep_rem_percent", "sleep_light_minutes", "sleep_light_percent",
  "daily_sleep_debt_minutes", "cumulative_sleep_debt_minutes", "bedtime", "wake_time", "hrv_ms",
  "resting_heart_rate", "respiratory_rate", "oxygen_saturation", "oxygen_saturation_lower", "oxygen_saturation_upper",
  "skin_temperature_delta", "nightly_temperature_celsius", "baseline_temperature_celsius", "steps", "active_energy_kcal",
  "total_energy_kcal", "zone_minutes", "light_zone_minutes", "moderate_zone_minutes", "vigorous_zone_minutes",
  "peak_zone_minutes", "active_minutes", "sedentary_minutes", "exercise_minutes", "distance_km", "running_distance_km",
  "running_duration_minutes", "running_pace_seconds_per_km", "running_average_heart_rate", "floors", "weight_kg",
  "body_fat_percent", "vo2_max", "altitude_gain_m", "height_cm", "core_body_temperature_celsius", "blood_glucose_mg_dl",
  "active_day", "active_day_rate_28d", "activity_consistency_28d", "weekly_load", "acute_chronic_load_ratio",
] as const;

export type AssistantHealthMetricField = (typeof assistantHealthMetricFields)[number];
export type AssistantHealthMetricFormat = "number" | "boolean" | "clock";
export type AssistantHealthMetricSource = "health_source" | "soma_calculation";

const units: Partial<Record<AssistantHealthMetricField, string>> = {
  sleep_minutes: "min", sleep_need_minutes: "min", sleep_efficiency: "%", sleep_regularity: "%",
  sleep_latency_minutes: "min", sleep_awake_minutes: "min", sleep_awake_percent: "%", sleep_awakenings: "count",
  sleep_fragmentation: "/h", sleep_deep_minutes: "min", sleep_deep_percent: "%", sleep_rem_minutes: "min",
  sleep_rem_percent: "%", sleep_light_minutes: "min", sleep_light_percent: "%", daily_sleep_debt_minutes: "min",
  cumulative_sleep_debt_minutes: "min", bedtime: "local time", wake_time: "local time", hrv_ms: "ms",
  resting_heart_rate: "bpm", respiratory_rate: "breaths/min", oxygen_saturation: "%", oxygen_saturation_lower: "%",
  oxygen_saturation_upper: "%", skin_temperature_delta: "°C", nightly_temperature_celsius: "°C",
  baseline_temperature_celsius: "°C", steps: "steps", active_energy_kcal: "kcal", total_energy_kcal: "kcal",
  zone_minutes: "min", light_zone_minutes: "min", moderate_zone_minutes: "min", vigorous_zone_minutes: "min",
  peak_zone_minutes: "min", active_minutes: "min", sedentary_minutes: "min", exercise_minutes: "min", distance_km: "km",
  running_distance_km: "km", running_duration_minutes: "min", running_pace_seconds_per_km: "s/km",
  running_average_heart_rate: "bpm", floors: "floors", weight_kg: "kg", body_fat_percent: "%", vo2_max: "ml/kg/min",
  altitude_gain_m: "m", height_cm: "cm", core_body_temperature_celsius: "°C", blood_glucose_mg_dl: "mg/dL",
  active_day: "yes/no", active_day_rate_28d: "%", activity_consistency_28d: "%",
  weekly_load: "load", acute_chronic_load_ratio: "ratio",
};

const somaCalculationFields = new Set<AssistantHealthMetricField>([
  "sleep_need_minutes", "sleep_regularity", "daily_sleep_debt_minutes", "cumulative_sleep_debt_minutes", "active_day", "active_day_rate_28d",
  "activity_consistency_28d", "weekly_load", "acute_chronic_load_ratio",
]);

const booleanFields = new Set<AssistantHealthMetricField>(["active_day"]);
const clockFields = new Set<AssistantHealthMetricField>(["bedtime", "wake_time"]);
const healthMetricSourceTypes: Partial<Record<AssistantHealthMetricField, string[]>> = {
  sleep_minutes: ["sleep"], sleep_efficiency: ["sleep"], sleep_latency_minutes: ["sleep"], sleep_awake_minutes: ["sleep"],
  sleep_awake_percent: ["sleep"], sleep_awakenings: ["sleep"], sleep_fragmentation: ["sleep"], sleep_deep_minutes: ["sleep"],
  sleep_deep_percent: ["sleep"], sleep_rem_minutes: ["sleep"], sleep_rem_percent: ["sleep"], sleep_light_minutes: ["sleep"],
  sleep_light_percent: ["sleep"], bedtime: ["sleep"], wake_time: ["sleep"], hrv_ms: ["daily-heart-rate-variability"],
  resting_heart_rate: ["daily-resting-heart-rate"], respiratory_rate: ["daily-respiratory-rate", "respiratory-rate-sleep-summary"],
  oxygen_saturation: ["daily-oxygen-saturation", "oxygen-saturation"], oxygen_saturation_lower: ["daily-oxygen-saturation"],
  oxygen_saturation_upper: ["daily-oxygen-saturation"], skin_temperature_delta: ["daily-sleep-temperature-derivations"],
  nightly_temperature_celsius: ["daily-sleep-temperature-derivations"], baseline_temperature_celsius: ["daily-sleep-temperature-derivations"],
  steps: ["steps"], active_energy_kcal: ["active-energy-burned"], total_energy_kcal: ["total-calories"],
  zone_minutes: ["active-zone-minutes"], light_zone_minutes: ["time-in-heart-rate-zone"],
  moderate_zone_minutes: ["time-in-heart-rate-zone"], vigorous_zone_minutes: ["time-in-heart-rate-zone"],
  peak_zone_minutes: ["time-in-heart-rate-zone"], active_minutes: ["active-minutes"], sedentary_minutes: ["sedentary-period"],
  exercise_minutes: ["daily-exercise-summary", "exercise"], distance_km: ["distance"], running_distance_km: ["exercise"],
  running_duration_minutes: ["exercise"], running_pace_seconds_per_km: ["exercise"], running_average_heart_rate: ["exercise"],
  floors: ["floors"], weight_kg: ["weight"], body_fat_percent: ["body-fat"], vo2_max: ["daily-vo2-max", "vo2-max", "run-vo2-max"],
  altitude_gain_m: ["altitude"], height_cm: ["height"], core_body_temperature_celsius: ["core-body-temperature"],
  blood_glucose_mg_dl: ["blood-glucose"],
};

function labelForField(field: AssistantHealthMetricField) {
  const definition = healthMetricRegistry.find((metric) => metric.field === field);
  if (definition) return definition.label;
  return field.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function aliasesForField(field: AssistantHealthMetricField) {
  const registryIds = healthMetricRegistry.filter((metric) => metric.field === field).map((metric) => metric.id);
  const additional: Partial<Record<AssistantHealthMetricField, string[]>> = {
    hrv_ms: ["HRV", "heart rate variability", "variabilité de la fréquence cardiaque"],
    resting_heart_rate: ["RHR", "resting heart rate", "fréquence cardiaque au repos"],
    oxygen_saturation: ["SpO2", "oxygen saturation", "saturation en oxygène"],
    bedtime: ["bedtime", "coucher", "heure de coucher"],
    wake_time: ["wake time", "réveil", "heure de réveil"],
    steps: ["pas", "steps"],
    running_distance_km: ["running distance", "course à pied", "distance de course"],
  };
  return [...new Set([...registryIds, ...(additional[field] ?? [])])];
}

export const assistantHealthMetricCatalog = assistantHealthMetricFields.map((field) => ({
  key: field,
  label: labelForField(field),
  aliases: aliasesForField(field),
  unit: units[field] ?? null,
  format: (clockFields.has(field) ? "clock" : booleanFields.has(field) ? "boolean" : "number") as AssistantHealthMetricFormat,
  sourceDataTypes: healthMetricSourceTypes[field] ?? [],
  source: (healthMetricRegistry.find((definition) => definition.field === field)?.source === "Soma" || somaCalculationFields.has(field)
    ? "soma_calculation"
    : "health_source") as AssistantHealthMetricSource,
}));

export const assistantDerivedMetricCatalog = [{
  key: "run_day", label: "Run day", aliases: ["running day", "jour de course"], unit: "yes/no", format: "boolean",
  source: "soma_calculation", derivedFrom: "activities", queryDataset: "activities",
}] as const;

export const assistantActivityTypeCatalog = [
  { key: "BOXING", label: "Boxe", aliases: ["boxe", "boxing", "boxing workout", "boxe anglaise"], sourceTypes: ["BOXING"] },
  { key: "KICKBOXING", label: "Kick-boxing", aliases: ["kickboxing", "kick boxing", "kick-boxing", "muay thai", "thaï boxing"], sourceTypes: ["KICKBOXING", "MARTIAL_ARTS"] },
  { key: "RUNNING", label: "Course à pied", aliases: ["course", "course à pied", "running", "jogging", "trail running", "trail"], sourceTypes: ["RUNNING", "JOGGING", "TRAIL_RUNNING"] },
  { key: "WALKING", label: "Marche", aliases: ["marche", "walking"], sourceTypes: ["WALKING"] },
  { key: "HIKING", label: "Randonnée", aliases: ["randonnée", "hiking", "trek"], sourceTypes: ["HIKING"] },
  { key: "CYCLING", label: "Vélo", aliases: ["vélo", "cyclisme", "cycling", "biking", "bike"], sourceTypes: ["BIKING", "CYCLING"] },
  { key: "SWIMMING", label: "Natation", aliases: ["natation", "swimming", "swim"], sourceTypes: ["SWIMMING"] },
  { key: "STRENGTH_TRAINING", label: "Musculation", aliases: ["musculation", "renforcement", "strength training", "weightlifting", "weights"], sourceTypes: ["STRENGTH_TRAINING", "WEIGHTLIFTING"] },
  { key: "YOGA", label: "Yoga", aliases: ["yoga"], sourceTypes: ["YOGA"] },
] as const;

function normalizeActivityType(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("en-US").replace(/[\s_-]+/g, " ");
}

export function assistantActivityTypeFilterValues(activityTypes: readonly string[]) {
  const values = new Set<string>();
  for (const requested of activityTypes) {
    const normalized = normalizeActivityType(requested);
    const matching = assistantActivityTypeCatalog.find((entry) =>
      normalizeActivityType(entry.key) === normalized || entry.aliases.some((alias) => normalizeActivityType(alias) === normalized),
    );
    if (matching) matching.sourceTypes.forEach((sourceType) => values.add(sourceType));
    else values.add(requested.trim().toLocaleUpperCase("en-US").replace(/[\s-]+/g, "_"));
  }
  return [...values];
}

export function assistantActivityTypeMatches(actualType: string, requestedTypes: readonly string[]) {
  if (!requestedTypes.length) return true;
  const normalizedActual = normalizeActivityType(actualType);
  return requestedTypes.some((requested) => {
    const normalized = normalizeActivityType(requested);
    const entry = assistantActivityTypeCatalog.find((candidate) =>
      normalizeActivityType(candidate.key) === normalized || candidate.aliases.some((alias) => normalizeActivityType(alias) === normalized),
    );
    return entry
      ? entry.sourceTypes.some((sourceType) => normalizeActivityType(sourceType) === normalizedActual)
      : normalizedActual === normalized;
  });
}

export function getAssistantDataCatalog() {
  return {
    healthMetrics: assistantHealthMetricCatalog,
    derivedMetrics: assistantDerivedMetricCatalog,
    activityTypes: assistantActivityTypeCatalog,
    datasets: ["daily_health", "scores", "nutrition_daily", "activities"] as const,
    defaultAnalysisPeriodDays: 90,
  };
}
