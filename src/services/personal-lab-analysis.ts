import type { LabObservation } from "@/domain/lab/observation";
import { journalValueAsNumber, type JournalEntry, type JournalVariable } from "@/domain/lab/journal";
import { adjustMatrixRelations, calculateMatrixRelation, isPersonalLabMetricAllowed, selectMeaningfulRelations, type AnalysisPeriod, type MatrixRelation, type MatrixSeries } from "@/domain/lab/matrix";
import { mealDailySeries, isMealMetric, type ConfirmedMealRecord } from "@/domain/lab/meals";
import { metricRoleFor, type LabMetricDefinition, type MetricRole } from "@/domain/lab/metrics";
import { addDays, dateInTimezone, toNumber, type HealthDay } from "./personal-lab-today";
import type { LabMetricCoverage, LabMatrixRow, PersonalLabSnapshot } from "./personal-lab-types";

const MAX_RELATION_LAG_DAYS = 2;
const OVERNIGHT_OUTCOME_IDS = new Set(["sleep_minutes", "sleep_need", "sleep_efficiency", "sleep_latency", "sleep_awake", "sleep_awake_percent", "sleep_awakenings", "sleep_fragmentation", "deep_sleep", "deep_sleep_percent", "rem_sleep", "rem_sleep_percent", "light_sleep", "light_sleep_percent", "hrv", "rhr", "respiratory", "spo2", "spo2_low", "spo2_high", "bedtime", "wake_time", "sleep_regularity", "sleep_debt", "daily_sleep_debt", "skin_temperature", "night_temperature", "baseline_temperature", "recovery"]);
const EFFORT_INPUT_IDS = new Set(["steps", "zone_minutes", "active_energy", "exercise_minutes"]);
const RECOVERY_INPUT_IDS = new Set(["hrv", "rhr", "sleep_minutes", "sleep_efficiency"]);
const SLEEP_DEBT_INPUT_IDS = new Set(["sleep_minutes", "sleep_need", "daily_sleep_debt"]);
const SAME_NIGHT_SLEEP_COMPONENTS = new Set([
  "sleep_efficiency",
  "sleep_awake",
  "sleep_awake_percent",
  "sleep_fragmentation",
  "deep_sleep",
  "deep_sleep_percent",
  "rem_sleep",
  "rem_sleep_percent",
  "light_sleep",
  "light_sleep_percent",
]);
const SAME_NIGHT_TIMING_INPUTS = new Map([
  ["bedtime", new Set(["sleep_minutes", "sleep_efficiency"])],
  ["wake_time", new Set(["sleep_minutes", "sleep_efficiency", "sleep_awake"])],
]);

export function timingForAutomaticMetric(metricId: string): "overnight" | "daytime" {
  return OVERNIGHT_OUTCOME_IDS.has(metricId) ? "overnight" : "daytime";
}

export function isImpossibleSameDayTiming(timing: "overnight" | "daytime" | "journal" | "unknown", outcomeId: string, lagDays: number) {
  return lagDays === 0 && OVERNIGHT_OUTCOME_IDS.has(outcomeId) && (timing === "journal" || timing === "daytime");
}

export function isMechanicalRelation(predictorId: string, outcomeId: string, lagDays = 0) {
  if (predictorId === outcomeId) return true;
  if (predictorId === "sleep_minutes" && lagDays === 0 && SAME_NIGHT_SLEEP_COMPONENTS.has(outcomeId)) return true;
  if (predictorId === "sleep_debt" && OVERNIGHT_OUTCOME_IDS.has(outcomeId)) return lagDays !== 1;
  if (lagDays === 0 && SAME_NIGHT_TIMING_INPUTS.get(predictorId)?.has(outcomeId)) return true;
  if ((predictorId === "effort" && EFFORT_INPUT_IDS.has(outcomeId)) || (outcomeId === "effort" && EFFORT_INPUT_IDS.has(predictorId))) return true;
  if ((predictorId === "recovery" && RECOVERY_INPUT_IDS.has(outcomeId)) || (outcomeId === "recovery" && RECOVERY_INPUT_IDS.has(predictorId))) return true;
  return (predictorId === "sleep_debt" && SLEEP_DEBT_INPUT_IDS.has(outcomeId))
    || (outcomeId === "sleep_debt" && SLEEP_DEBT_INPUT_IDS.has(predictorId))
    || (predictorId === "daily_sleep_debt" && outcomeId === "sleep_minutes")
    || (outcomeId === "daily_sleep_debt" && predictorId === "sleep_minutes");
}

export function labMatrixCacheKey(periods: AnalysisPeriod[] | undefined) {
  return periods?.length === 1 ? String(periods[0]) : null;
}

export function isCachedMatrix(value: unknown): value is PersonalLabSnapshot["matrix"] {
  if (!value || typeof value !== "object") return false;
  const matrix = value as Partial<PersonalLabSnapshot["matrix"]>;
  const relationListIsAllowed = (relations: unknown) => Array.isArray(relations)
    && relations.every((relation) => relation && typeof relation === "object"
      && isPersonalLabMetricAllowed((relation as MatrixRelation).predictorId)
      && isPersonalLabMetricAllowed((relation as MatrixRelation).outcomeId));
  return Array.isArray(matrix.outcomes)
    && typeof matrix.analysisEndDate === "string"
    && Array.isArray(matrix.rows)
    && Array.isArray(matrix.periods)
    && relationListIsAllowed(matrix.meaningfulRelations)
    && relationListIsAllowed(matrix.topRelations)
    && relationListIsAllowed(matrix.acuteHighlights)
    && relationListIsAllowed(matrix.chronicHighlights)
    && Array.isArray(matrix.coverageByMetric)
    && Array.isArray(matrix.collectionProgress)
    && matrix.outcomes.every((outcome) => typeof outcome?.id === "string" && isPersonalLabMetricAllowed(outcome.id))
    && matrix.rows.every((row) => row && Array.isArray(row.relations)
      && row.relations.every((relation) => isPersonalLabMetricAllowed(relation.predictorId) && isPersonalLabMetricAllowed(relation.outcomeId)));
}

export function analysisWindowForPeriods(periods: AnalysisPeriod[] | undefined, now: Date = new Date()) {
  if (!periods?.length || periods.includes("all")) return null;
  const longestPeriod = Math.max(...periods.filter((period): period is Exclude<AnalysisPeriod, "all"> => period !== "all"));
  const days = longestPeriod + MAX_RELATION_LAG_DAYS;
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { start: start.toISOString().slice(0, 10), days };
}

/**
 * The first screen needs the 30-day averages and the 28-day journal
 * achievements, not the full analysis window requested by the page.
 * Analysis callers keep their requested period unchanged.
 */
export function readWindowForStream(includeAnalysis: boolean, periods: AnalysisPeriod[] | undefined, now: Date = new Date()) {
  return analysisWindowForPeriods(includeAnalysis ? periods : [30], now);
}

export function latestLabDate(healthDates: readonly string[], journalDates: readonly string[], fallback: string) {
  const dates = [...healthDates, ...journalDates];
  return dates.reduce((latest, date) => date > latest ? date : latest, dates[0] ?? fallback);
}

export function hasReliableOvernightData(day: Partial<HealthDay> | undefined) {
  if (!day || toNumber(day.sleep_minutes) === null || !day.bedtime || !day.wake_time) return false;
  return [day.sleep_efficiency, day.sleep_deep_minutes, day.sleep_rem_minutes, day.hrv_ms, day.resting_heart_rate]
    .some((value) => toNumber(value) !== null);
}

export function overnightFingerprint(day: Partial<HealthDay> | undefined) {
  if (!hasReliableOvernightData(day)) return null;
  const value = JSON.stringify([
    day?.sleep_minutes, day?.bedtime, day?.wake_time, day?.sleep_efficiency,
    day?.sleep_latency_minutes, day?.sleep_awake_minutes,
    day?.sleep_fragmentation, day?.sleep_deep_minutes, day?.sleep_rem_minutes,
    day?.hrv_ms, day?.resting_heart_rate, day?.respiratory_rate,
  ]);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function minutesInTimezone(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const hours = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minutes = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const result = hours * 60 + minutes;
  return result < 12 * 60 ? result + 24 * 60 : result;
}

function healthSeries(health: HealthDay[], id: string, label: string, unit: string, key: string): MatrixSeries {
  return {
    id,
    label,
    unit,
    kind: id === "active_day" ? "binary" : "numeric",
    points: health.flatMap((day) => {
      const value = toNumber((day as unknown as Record<string, unknown>)[key]);
      return value === null ? [] : [{ date: day.metric_date, value, segment: day.data_quality?.primaryWearable ?? undefined }];
    }),
  };
}

const RELIABLE_ACTIVITY_DATA_TYPES = new Set([
  "steps",
  "exercise",
  "daily-exercise-summary",
  "distance",
  "active-minutes",
  "active-zone-minutes",
  "time-in-heart-rate-zone",
  "sedentary-period",
]);

/**
 * A day with any recorded activity is covered by the wearable: a recorded run
 * becomes 1 and the absence of a run becomes 0. Days without activity data
 * remain unknown and are excluded from the comparison.
 */
export function hasReliableActivityCoverage(day: Pick<HealthDay, "data_quality">) {
  return (day.data_quality?.presentTypes ?? []).some((type) => RELIABLE_ACTIVITY_DATA_TYPES.has(type));
}

function hasRecordedRun(day: Pick<HealthDay, "running_distance_km" | "running_duration_minutes" | "running_pace_seconds_per_km" | "running_average_heart_rate">) {
  return [day.running_distance_km, day.running_duration_minutes, day.running_pace_seconds_per_km, day.running_average_heart_rate]
    .some((value) => toNumber(value) !== null && Number(value) > 0);
}

type RunningDay = Pick<HealthDay, "metric_date" | "running_distance_km" | "running_duration_minutes" | "running_pace_seconds_per_km" | "running_average_heart_rate" | "data_quality">;

export function runningDaySeries(health: RunningDay[]): MatrixSeries {
  return {
    id: "run_day",
    label: "Run day",
    unit: "yes/no",
    kind: "binary",
    points: health.flatMap((day) => {
      if (!hasReliableActivityCoverage(day)) return [];
      return [{ date: day.metric_date, value: hasRecordedRun(day) ? 1 : 0, segment: day.data_quality?.primaryWearable ?? undefined }];
    }),
  };
}

function combinedHealthSeries(health: HealthDay[], id: string, label: string, unit: string, keys: Array<keyof HealthDay>): MatrixSeries {
  return {
    id,
    label,
    unit,
    kind: "numeric",
    points: health.flatMap((day) => {
      const values = keys.map((key) => toNumber(day[key])).filter((value): value is number => value !== null);
      return values.length ? [{ date: day.metric_date, value: values.reduce((sum, value) => sum + value, 0), segment: day.data_quality?.primaryWearable ?? undefined }] : [];
    }),
  };
}

function coverageForSeries(series: MatrixSeries): LabMetricCoverage {
  const sources = new Map<string, number>();
  const defaultSource = isMealMetric(series.id) ? "Soma meals" : "Journal / calendar";
  for (const point of series.points) {
    const source = point.segment ?? defaultSource;
    sources.set(source, (sources.get(source) ?? 0) + 1);
  }
  return {
    id: series.id,
    label: series.label,
    recordedDays: new Set(series.points.map((point) => point.date)).size,
    requiredDays: 15,
    sources: [...sources].map(([source, days]) => ({ source, days })).sort((first, second) => second.days - first.days),
  };
}

export function buildCorrelationMatrix(input: {
  health: HealthDay[];
  observations: LabObservation[];
  variables: JournalVariable[];
  entries: JournalEntry[];
  validatedDates: Set<string>;
  metricPreferences: ReadonlyMap<string, MetricRole>;
  metricDefinitions: readonly LabMetricDefinition[];
  meals?: readonly ConfirmedMealRecord[];
  timeZone: string;
  requestedPeriods?: AnalysisPeriod[];
}): PersonalLabSnapshot["matrix"] {
  const health = [...input.health].sort((a, b) => a.metric_date.localeCompare(b.metric_date));
  const wearableSourceByDate = new Map(health.map((day) => [day.metric_date, day.data_quality?.primaryWearable ?? undefined]));
  const bedtime: MatrixSeries = { id: "bedtime", label: "Bedtime", unit: "min", kind: "numeric", presentation: "clock-time", points: health.flatMap((day) => day.bedtime ? [{ date: day.metric_date, value: minutesInTimezone(day.bedtime, input.timeZone), segment: day.data_quality?.primaryWearable ?? undefined }] : []) };
  const wakeTime: MatrixSeries = { id: "wake_time", label: "Wake time", unit: "min", kind: "numeric", presentation: "clock-time", points: health.flatMap((day) => day.wake_time ? [{ date: day.metric_date, value: minutesInTimezone(day.wake_time, input.timeZone), segment: day.data_quality?.primaryWearable ?? undefined }] : []) };
  const coreOutcomes = [
    { ...healthSeries(health, "sleep_minutes", "Sleep duration", "min", "sleep_minutes"), direction: "target" as const },
    { ...healthSeries(health, "sleep_efficiency", "Sleep efficiency", "%", "sleep_efficiency"), direction: "higher" as const },
    { ...healthSeries(health, "sleep_latency", "Sleep latency", "min", "sleep_latency_minutes"), direction: "lower" as const },
    { ...healthSeries(health, "sleep_awake", "Awake time", "min", "sleep_awake_minutes"), direction: "lower" as const },
    { ...healthSeries(health, "sleep_fragmentation", "Fragmentation", "/h", "sleep_fragmentation"), direction: "lower" as const },
    { ...healthSeries(health, "deep_sleep", "Deep sleep", "min", "sleep_deep_minutes"), direction: "higher" as const },
    { ...healthSeries(health, "rem_sleep", "REM sleep", "min", "sleep_rem_minutes"), direction: "higher" as const },
    { ...healthSeries(health, "hrv", "HRV", "ms", "hrv_ms"), direction: "higher" as const },
    { ...healthSeries(health, "rhr", "Resting heart rate", "bpm", "resting_heart_rate"), direction: "lower" as const },
    { ...healthSeries(health, "respiratory", "Respiratory rate", "/min", "respiratory_rate"), direction: "target" as const },
    { ...healthSeries(health, "spo2", "Oxygen saturation", "%", "oxygen_saturation"), direction: "higher" as const },
  ];
  const coreOutcomeIds = new Set(coreOutcomes.map((outcome) => outcome.id));
  const scoreOutcome = (id: "recovery" | "effort", label: string, unit: string, direction: "higher" | "target") => ({
    id, label, unit, direction, kind: "numeric" as const,
    points: input.observations.flatMap((day) => {
      const value = id === "recovery" ? day.recoveryScore : day.effortScore;
      return value === null ? [] : [{ date: day.date, value, segment: wearableSourceByDate.get(day.date) }];
    }),
  });
  const dailyOutcomes = [
    ...coreOutcomes,
    ...input.metricDefinitions.filter((metric) => isPersonalLabMetricAllowed(metric.id) && !isMealMetric(metric.id) && !coreOutcomeIds.has(metric.id) && !["bedtime", "wake_time", "recovery", "effort"].includes(metric.id))
      .map((metric) => ({ ...healthSeries(health, metric.id, metric.label, metric.unit, metric.field), direction: metric.direction })),
    { ...bedtime, direction: "target" as const },
    { ...wakeTime, direction: "target" as const },
    scoreOutcome("recovery", "Recovery", "pts", "higher"),
    scoreOutcome("effort", "Effort", "pts", "target"),
  ].filter((outcome) => ["result", "both"].includes(metricRoleFor(outcome.id, input.metricPreferences)));
  const intense = combinedHealthSeries(health, "intense_minutes", "Intense-zone effort", "min", ["vigorous_zone_minutes", "peak_zone_minutes"]);
  const exercise = healthSeries(health, "exercise_minutes", "Exercise time", "min", "exercise_minutes");
  const effortSeries: MatrixSeries = { id: "effort", label: "Effort", unit: "pts", kind: "numeric", presentation: "amount", points: input.observations.flatMap((day) => day.effortScore === null ? [] : [{ date: day.date, value: day.effortScore }]) };

  type RowSpec = { series: MatrixSeries; acuteLags: number[]; chronic: boolean; journal: boolean; timing: "overnight" | "daytime" | "journal" | "unknown" };
  const automaticRows: RowSpec[] = [
    { series: healthSeries(health, "sleep_minutes", "Previous night's sleep duration", "min", "sleep_minutes"), acuteLags: [1, 2], chronic: true, journal: false, timing: "overnight" },
    { series: bedtime, acuteLags: [0], chronic: true, journal: false, timing: "overnight" },
    { series: wakeTime, acuteLags: [0], chronic: true, journal: false, timing: "overnight" },
    { series: healthSeries(health, "sleep_regularity", "Sleep regularity", "%", "sleep_regularity"), acuteLags: [0], chronic: true, journal: false, timing: "overnight" },
    { series: healthSeries(health, "sleep_debt", "Sleep debt", "min", "cumulative_sleep_debt_minutes"), acuteLags: [1], chronic: true, journal: false, timing: "overnight" },
    { series: healthSeries(health, "steps", "Steps", "steps", "steps"), acuteLags: [0, 1, 2], chronic: true, journal: false, timing: "daytime" },
    { series: healthSeries(health, "zone_minutes", "Zone minutes", "min", "zone_minutes"), acuteLags: [0, 1, 2], chronic: true, journal: false, timing: "daytime" },
    { series: intense, acuteLags: [0, 1, 2], chronic: true, journal: false, timing: "daytime" },
    { series: exercise, acuteLags: [0, 1, 2], chronic: true, journal: false, timing: "daytime" },
    { series: healthSeries(health, "active_minutes", "Active time", "min", "active_minutes"), acuteLags: [0, 1, 2], chronic: true, journal: false, timing: "daytime" },
    { series: healthSeries(health, "sedentary_minutes", "Sedentary time", "min", "sedentary_minutes"), acuteLags: [0, 1, 2], chronic: true, journal: false, timing: "daytime" },
    { series: healthSeries(health, "running_distance", "Running distance", "km", "running_distance_km"), acuteLags: [0, 1, 2], chronic: true, journal: false, timing: "daytime" },
    { series: runningDaySeries(health), acuteLags: [0, 1, 2], chronic: true, journal: false, timing: "daytime" },
    { series: healthSeries(health, "running_pace", "Running pace", "sec/km", "running_pace_seconds_per_km"), acuteLags: [0, 1, 2], chronic: true, journal: false, timing: "daytime" },
    { series: healthSeries(health, "running_average_heart_rate", "Running average heart rate", "bpm", "running_average_heart_rate"), acuteLags: [0, 1, 2], chronic: true, journal: false, timing: "daytime" },
    { series: healthSeries(health, "active_day", "Active day", "yes/no", "active_day"), acuteLags: [0, 1, 2], chronic: true, journal: false, timing: "daytime" },
    { series: healthSeries(health, "skin_temperature", "Skin temperature delta", "°C", "skin_temperature_delta"), acuteLags: [0, 1, 2], chronic: true, journal: false, timing: "overnight" },
    { series: effortSeries, acuteLags: [0, 1, 2], chronic: true, journal: false, timing: "daytime" },
  ];
  const mealRows: RowSpec[] = Object.values(mealDailySeries(input.meals ?? [])).map((series) => ({
    series,
    acuteLags: [0, 1, 2],
    chronic: true,
    journal: false,
    timing: "daytime",
  }));

  const entriesByVariable = new Map<string, JournalEntry[]>();
  for (const entry of input.entries.filter((candidate) => input.validatedDates.has(candidate.entryDate))) entriesByVariable.set(entry.variableId, [...(entriesByVariable.get(entry.variableId) ?? []), entry]);
  const journalRows: RowSpec[] = input.variables.filter((variable) => variable.isActive || entriesByVariable.has(variable.id)).flatMap((variable): RowSpec[] => {
    const recorded = new Map((entriesByVariable.get(variable.id) ?? []).map((entry) => [entry.entryDate, entry.value]));
    if (variable.variableType === "category") return variable.options.map((option) => ({
      series: { id: `journal:${variable.id}:${option}`, label: `${variable.name} · ${option}${variable.isActive ? "" : " · archived"}`, unit: "", kind: "binary" as const, points: [...recorded].flatMap(([date, value]) => typeof value === "string" ? [{ date, value: value === option ? 1 : 0 }] : []) },
      acuteLags: [0, 1, 2],
      chronic: true,
      journal: true,
      timing: "journal",
    }));
    const kind = variable.variableType === "boolean" ? "binary" as const : "numeric" as const;
    return [{
      series: { id: `journal:${variable.id}`, label: `${variable.name}${variable.isActive ? "" : " · archived"}`, unit: variable.variableType === "time" ? "min" : variable.unit ?? "", kind, presentation: variable.variableType === "time" ? "clock-time" as const : "amount" as const, points: [...recorded].flatMap(([date, value]) => {
        const number = journalValueAsNumber(variable, value);
        return number === null ? [] : [{ date, value: number }];
      }) },
      acuteLags: [0, 1, 2],
      chronic: true,
      journal: true,
      timing: "journal",
    }];
  });

  const minimumVisibleEffect: Record<string, number> = {
    sleep_minutes: 15,
    sleep_efficiency: 1.5,
    sleep_latency: 5,
    sleep_awake: 5,
    deep_sleep: 5,
    rem_sleep: 5,
    hrv: 2,
    rhr: 1,
    respiratory: .3,
    spo2: .3,
    recovery: 3,
  };
  const excludeDerivedOutcome = (relation: MatrixRelation) => isMechanicalRelation(relation.predictorId, relation.outcomeId, relation.lagDays)
    ? {
      ...relation,
      coefficient: null,
      effect: null,
      effectConfidenceLow: null,
      effectConfidenceHigh: null,
      evidence: "insufficient" as const,
      strength: "hidden" as const,
      stable: false,
      practicallyMeaningful: false,
      practicalRatio: 0,
      featureEligible: false,
      excluded: true,
      exclusionReasons: [relation.predictorId === relation.outcomeId ? "A metric is not compared with itself" : "These measures share a direct calculation"],
    }
    : relation;
  const excludeImpossibleTiming = (relation: MatrixRelation, timing: RowSpec["timing"]) => isImpossibleSameDayTiming(timing, relation.outcomeId, relation.lagDays)
    ? {
      ...relation,
      coefficient: null,
      effect: null,
      effectConfidenceLow: null,
      effectConfidenceHigh: null,
      evidence: "insufficient" as const,
      strength: "hidden" as const,
      stable: false,
      practicallyMeaningful: false,
      practicalRatio: 0,
      featureEligible: false,
      excluded: true,
      exclusionReasons: ["This overnight outcome was measured before the daytime behavior; use the following-night or next-day relation"],
    }
    : relation;
  const automaticIds = new Set(automaticRows.map((row) => row.series.id));
  const genericAutomaticRows: RowSpec[] = input.metricDefinitions
    .filter((metric) => isPersonalLabMetricAllowed(metric.id) && !isMealMetric(metric.id) && !automaticIds.has(metric.id) && !["bedtime", "wake_time", "recovery", "effort"].includes(metric.id))
    .map((metric) => {
      const binary = metric.id === "active_day" || health.some((day) => typeof (day as unknown as Record<string, unknown>)[metric.field] === "boolean");
      return { series: { ...healthSeries(health, metric.id, metric.label, metric.unit, metric.field), kind: binary ? "binary" as const : "numeric" as const }, acuteLags: [0, 1, 2], chronic: true, journal: false, timing: timingForAutomaticMetric(metric.id) };
    });
  const allSpecs = [...journalRows, ...[...automaticRows, ...genericAutomaticRows, ...mealRows].filter((row) => ["influence", "both"].includes(metricRoleFor(row.series.id, input.metricPreferences)))];
  const periods: AnalysisPeriod[] = [15, 30, 90, "all"];
  const calculatedPeriods = input.requestedPeriods ?? periods;
  const latestDate = latestLabDate(
    [...health.map((day) => day.metric_date), ...(input.meals ?? []).map((meal) => meal.mealDate)],
    input.entries.map((entry) => entry.entryDate),
    dateInTimezone(input.timeZone),
  );
  const filterPeriod = (series: MatrixSeries, period: AnalysisPeriod): MatrixSeries => period === "all" ? series : {
    ...series,
    points: series.points.filter((point) => point.date >= addDays(latestDate, -(period - 1))),
  };
  const automaticEmojiByMetric: Record<string, string> = {
    bedtime: "🌙",
    wake_time: "🌅",
    sleep_regularity: "📐",
    sleep_debt: "💤",
    steps: "👣",
    zone_minutes: "❤️‍🔥",
    intense_minutes: "🔥",
    exercise_minutes: "🏋️",
    active_minutes: "⚡",
    skin_temperature: "🌡️",
    effort: "💪",
    run_day: "🏃",
    meal_calories: "🍽️",
    meal_protein: "🥚",
    meal_carbs: "🍞",
    meal_fat: "🥑",
    meal_fiber: "🌾",
    meal_sugar: "🍭",
    meal_added_sugar: "🍬",
    meal_count: "🍴",
    meal_coverage: "📅",
    meal_homemade_count: "🏠",
    meal_prepared_count: "🛒",
    meal_mixed_count: "🍲",
    meal_homemade_share: "🏠",
    meal_mouth_heat_average: "👄",
    meal_mouth_heat_maximum: "👄",
    meal_stomach_overfullness_average: "💥",
    meal_stomach_overfullness_maximum: "💥",
  };
  const emojiByVariable = new Map(input.variables.map((variable) => [`journal:${variable.id}`, variable.emoji]));
  const rows: LabMatrixRow[] = calculatedPeriods.flatMap((period) => allSpecs.flatMap((row) => row.acuteLags.map((lagDays) => ({
    id: `${period}:${row.series.id}:lag-${lagDays}`,
    label: row.series.label,
    emoji: [...emojiByVariable.entries()].find(([id]) => row.series.id.startsWith(id))?.[1] ?? automaticEmojiByMetric[row.series.id] ?? null,
    grain: "day" as const,
    timeScale: "acute" as const,
    period,
    lagLabel: lagDays === 0 ? "same day" : lagDays === 1 ? "following night / next day" : "two days later",
    relations: dailyOutcomes.map((outcome) => excludeImpossibleTiming(excludeDerivedOutcome(calculateMatrixRelation(
      filterPeriod(row.series, period),
      filterPeriod(outcome, period),
      lagDays,
      {
        grain: "day",
        timeScale: "acute",
        family: row.journal ? "journal-acute" : "automatic-acute",
        minimumMeaningfulEffect: minimumVisibleEffect[outcome.id],
        period,
        analysisEndDate: latestDate,
        outcomeDirection: outcome.direction,
        outcomeTarget: outcome.id === "sleep_minutes" ? 510 : undefined,
      },
    )), row.timing)),
  }))));
  const adjusted = new Map<MatrixRelation, MatrixRelation>();
  for (const period of calculatedPeriods) {
    const relations = rows.filter((row) => row.period === period).flatMap((row) => row.relations);
    const periodAdjusted = adjustMatrixRelations(relations);
    relations.forEach((relation, index) => adjusted.set(relation, periodAdjusted[index]));
  }
  const adjustedRows = rows.map((row) => ({ ...row, relations: row.relations.map((relation) => adjusted.get(relation) ?? relation) }));
  const visibleRows = adjustedRows;
  const visiblePredictors = new Set(visibleRows.flatMap((row) => row.relations.map((relation) => relation.predictorId)));
  const coverageByMetric = [...new Map(allSpecs.map((row) => [row.series.id, coverageForSeries(row.series)])).values()];
  const collectionProgress = coverageByMetric.filter((coverage) => !visiblePredictors.has(coverage.id));
  const meaningfulRelations = selectMeaningfulRelations(visibleRows.flatMap((row) => row.relations), 40);
  const acuteHighlights = selectMeaningfulRelations(visibleRows.filter((row) => row.period === 30).flatMap((row) => row.relations), 8);
  const chronicHighlights = selectMeaningfulRelations(visibleRows.filter((row) => row.period === 90 || row.period === "all").flatMap((row) => row.relations), 8);
  const topRelations = meaningfulRelations;
  return {
    analysisEndDate: latestDate,
    outcomes: dailyOutcomes.map(({ id, label, unit, direction }) => ({ id, label, unit, direction })),
    rows: visibleRows,
    periods,
    meaningfulRelations,
    topRelations,
    acuteHighlights,
    chronicHighlights,
    coverageByMetric,
    collectionProgress,
  };
}
