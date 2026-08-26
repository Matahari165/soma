import type { LabObservation } from "@/domain/lab/insights";
import { defaultJournalVariables, journalValueAsNumber, type JournalEntry, type JournalVariable } from "@/domain/lab/journal";
import { adjustMatrixRelations, calculateMatrixRelation, selectMeaningfulRelations, type AnalysisPeriod, type MatrixRelation, type MatrixSeries } from "@/domain/lab/matrix";
import { metricDefinitionsForHealth, metricRoleFor, type LabMetricDefinition, type MetricRole } from "@/domain/lab/metrics";
import type { SomaUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { createCloudflareAdminClient, labMatrixInputRevision } from "@/lib/cloudflare/db";
import { getLabMatrixCacheObject, LAB_MATRIX_CACHE_VERSION, putLabMatrixCacheObject } from "@/lib/lab-matrix-cache";
import { loadJournalData } from "@/services/journal";
import { evidenceCandidatesForNarrative } from "@/services/lab-narrative-policy";

export type DailyCheckin = {
  checkin_date: string;
  energy: number | null;
  focus: number | null;
  stress: number | null;
  mood: number | null;
  soreness: number | null;
  caffeine_servings: number | null;
  alcohol_servings: number | null;
  late_meal: boolean | null;
  illness: boolean | null;
  deep_work_minutes_override: number | null;
};

type CalendarDay = {
  metric_date: string;
  deep_work_minutes: number;
  deep_work_event_count: number;
  total_scheduled_minutes: number;
  synced_at: string;
};

type HealthDay = {
  metric_date: string;
  sleep_minutes: number | null;
  sleep_efficiency: number | null;
  sleep_latency_minutes: number | null;
  sleep_awake_minutes: number | null;
  sleep_awakenings: number | null;
  sleep_fragmentation: number | null;
  sleep_regularity: number | null;
  cumulative_sleep_debt_minutes: number | null;
  hrv_ms: number | null;
  resting_heart_rate: number | null;
  steps: number | null;
  zone_minutes: number | null;
  bedtime: string | null;
  wake_time: string | null;
  sleep_deep_minutes: number | null;
  sleep_rem_minutes: number | null;
  respiratory_rate: number | null;
  oxygen_saturation: number | null;
  skin_temperature_delta: number | null;
  vigorous_zone_minutes: number | null;
  peak_zone_minutes: number | null;
  active_minutes: number | null;
  exercise_minutes: number | null;
  data_quality?: { primaryWearable?: string | null };
};

type ScoreDay = { score_date: string; kind: "sleep" | "recovery" | "effort"; score: number | null };
export type LabMatrixRow = { id: string; label: string; emoji: string | null; grain: "day"; timeScale: "acute"; period: AnalysisPeriod; lagLabel: string; relations: MatrixRelation[] };
export type LabMetricCoverage = {
  id: string;
  label: string;
  recordedDays: number;
  requiredDays: number;
  sources: Array<{ source: string; days: number }>;
};

export type PersonalLabSnapshot = {
  todayDate: string;
  overnightFingerprint: string | null;
  dateLabel: string;
  greetingName: string;
  checkin: DailyCheckin | null;
  journal: {
    variables: JournalVariable[];
    entries: JournalEntry[];
    days: import("@/domain/lab/journal").JournalDay[];
  };
  today: {
    sleepMinutes: number | null;
    recoveryScore: number | null;
    effortScore: number | null;
    averageSleepMinutes: number | null;
    averageRecoveryScore: number | null;
    averageEffortScore: number | null;
    deepWorkMinutes: number | null;
    calendarDeepWorkMinutes: number | null;
    deepWorkSource: "calendar" | "corrected" | "missing";
    focus: number | null;
    energy: number | null;
  };
  aiNarrative: {
    isCurrent: boolean;
    id: string | null;
    headline: string;
    summary: string;
    highlights: string[];
    model: string;
    generatedAt: string;
    liked: boolean;
    sourceFacts: Array<{ predictor: string; outcome: string; period: AnalysisPeriod; lagDays: number }>;
    evidenceCandidates: unknown[];
    history: Array<{ id: string; headline: string; summary: string; highlights: string[]; generatedAt: string; liked: boolean; sourceFacts: Array<{ predictor: string; outcome: string; period: AnalysisPeriod; lagDays: number }> }>;
  } | null;
  needsNarrativeRefresh: boolean;
  metricRegistry: Array<LabMetricDefinition & { role: MetricRole; recordedDays: number; received: boolean; sources: Array<{ source: string; days: number }> }>;
  matrix: {
    outcomes: Array<{ id: string; label: string; unit: string; direction: "higher" | "lower" | "target" }>;
    rows: LabMatrixRow[];
    periods: AnalysisPeriod[];
    meaningfulRelations: MatrixRelation[];
    topRelations: MatrixRelation[];
    acuteHighlights: MatrixRelation[];
    chronicHighlights: MatrixRelation[];
    coverageByMetric: LabMetricCoverage[];
    collectionProgress: LabMetricCoverage[];
  };
  coverage: {
    healthDays: number;
    calendarDays: number;
    checkinDays: number;
    journalDays: number;
    pairedDeepWorkDays: number;
    rangeDays: number;
  };
  connections: {
    health: { connected: boolean; lastSyncedAt: string | null };
    calendar: { connected: boolean; lastSyncedAt: string | null };
  };
};

export type PersonalLabToday = Pick<PersonalLabSnapshot["today"], "sleepMinutes" | "recoveryScore" | "effortScore" | "averageSleepMinutes" | "averageRecoveryScore" | "averageEffortScore"> & { overnightFingerprint: string | null };

const MAX_RELATION_LAG_DAYS = 2;
const OVERNIGHT_OUTCOME_IDS = new Set(["sleep_minutes", "sleep_need", "sleep_efficiency", "sleep_latency", "sleep_awake", "sleep_awake_percent", "sleep_awakenings", "sleep_fragmentation", "deep_sleep", "deep_sleep_percent", "rem_sleep", "rem_sleep_percent", "light_sleep", "light_sleep_percent", "hrv", "rhr", "respiratory", "spo2", "spo2_low", "spo2_high", "bedtime", "wake_time", "sleep_regularity", "sleep_debt", "daily_sleep_debt", "skin_temperature", "night_temperature", "baseline_temperature", "recovery"]);

export function timingForAutomaticMetric(metricId: string): "overnight" | "daytime" {
  return OVERNIGHT_OUTCOME_IDS.has(metricId) ? "overnight" : "daytime";
}

export function isImpossibleSameDayTiming(timing: "overnight" | "daytime" | "journal" | "unknown", outcomeId: string, lagDays: number) {
  return lagDays === 0 && OVERNIGHT_OUTCOME_IDS.has(outcomeId) && (timing === "journal" || timing === "daytime");
}

export function labMatrixCacheKey(periods: AnalysisPeriod[] | undefined) {
  return periods?.length === 1 ? String(periods[0]) : null;
}

function isCachedMatrix(value: unknown): value is PersonalLabSnapshot["matrix"] {
  if (!value || typeof value !== "object") return false;
  const matrix = value as Partial<PersonalLabSnapshot["matrix"]>;
  return Array.isArray(matrix.outcomes)
    && Array.isArray(matrix.rows)
    && Array.isArray(matrix.periods)
    && Array.isArray(matrix.meaningfulRelations)
    && Array.isArray(matrix.topRelations)
    && Array.isArray(matrix.acuteHighlights)
    && Array.isArray(matrix.chronicHighlights)
    && Array.isArray(matrix.coverageByMetric)
    && Array.isArray(matrix.collectionProgress);
}

export function analysisWindowForPeriods(periods: AnalysisPeriod[] | undefined, now: Date = new Date()) {
  if (!periods?.length || periods.includes("all")) return null;
  const longestPeriod = Math.max(...periods.filter((period): period is Exclude<AnalysisPeriod, "all"> => period !== "all"));
  const days = longestPeriod + MAX_RELATION_LAG_DAYS;
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { start: start.toISOString().slice(0, 10), days };
}

export function latestLabDate(healthDates: readonly string[], journalDates: readonly string[], fallback: string) {
  const dates = [...healthDates, ...journalDates];
  return dates.reduce((latest, date) => date > latest ? date : latest, dates[0] ?? fallback);
}

function dateInTimezone(timeZone: string, value: string | Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
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
    day?.sleep_latency_minutes, day?.sleep_awake_minutes, day?.sleep_awakenings,
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

function toNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function average(values: Array<number | null | undefined>) {
  const present = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

export function recentAverages(observations: LabObservation[], todayDate: string) {
  const recent = observations.filter((day) => day.date >= addDays(todayDate, -29) && day.date <= todayDate);
  return {
    averageSleepMinutes: average(recent.map((day) => day.sleepMinutes)),
    averageRecoveryScore: average(recent.map((day) => day.recoveryScore)),
    averageEffortScore: average(recent.map((day) => day.effortScore)),
  };
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
    kind: "numeric",
    points: health.flatMap((day) => {
      const value = toNumber((day as unknown as Record<string, unknown>)[key]);
      return value === null ? [] : [{ date: day.metric_date, value, segment: day.data_quality?.primaryWearable ?? undefined }];
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
  for (const point of series.points) sources.set(point.segment ?? "Journal / calendar", (sources.get(point.segment ?? "Journal / calendar") ?? 0) + 1);
  return {
    id: series.id,
    label: series.label,
    recordedDays: new Set(series.points.map((point) => point.date)).size,
    requiredDays: 15,
    sources: [...sources].map(([source, days]) => ({ source, days })).sort((first, second) => second.days - first.days),
  };
}

function buildCorrelationMatrix(input: {
  health: HealthDay[];
  observations: LabObservation[];
  variables: JournalVariable[];
  entries: JournalEntry[];
  validatedDates: Set<string>;
  metricPreferences: ReadonlyMap<string, MetricRole>;
  metricDefinitions: readonly LabMetricDefinition[];
  timeZone: string;
  requestedPeriods?: AnalysisPeriod[];
}) {
  const health = [...input.health].sort((a, b) => a.metric_date.localeCompare(b.metric_date));
  const wearableSourceByDate = new Map(health.map((day) => [day.metric_date, day.data_quality?.primaryWearable ?? undefined]));
  const bedtime: MatrixSeries = { id: "bedtime", label: "Bedtime", unit: "min", kind: "numeric", presentation: "clock-time", points: health.flatMap((day) => day.bedtime ? [{ date: day.metric_date, value: minutesInTimezone(day.bedtime, input.timeZone), segment: day.data_quality?.primaryWearable ?? undefined }] : []) };
  const wakeTime: MatrixSeries = { id: "wake_time", label: "Wake time", unit: "min", kind: "numeric", presentation: "clock-time", points: health.flatMap((day) => day.wake_time ? [{ date: day.metric_date, value: minutesInTimezone(day.wake_time, input.timeZone), segment: day.data_quality?.primaryWearable ?? undefined }] : []) };
  const coreOutcomes = [
    { ...healthSeries(health, "sleep_minutes", "Sleep duration", "min", "sleep_minutes"), direction: "target" as const },
    { ...healthSeries(health, "sleep_efficiency", "Sleep efficiency", "%", "sleep_efficiency"), direction: "higher" as const },
    { ...healthSeries(health, "sleep_latency", "Sleep latency", "min", "sleep_latency_minutes"), direction: "lower" as const },
    { ...healthSeries(health, "sleep_awake", "Awake time", "min", "sleep_awake_minutes"), direction: "lower" as const },
    { ...healthSeries(health, "sleep_awakenings", "Awakenings", "count", "sleep_awakenings"), direction: "lower" as const },
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
    ...input.metricDefinitions.filter((metric) => !coreOutcomeIds.has(metric.id) && !["bedtime", "wake_time", "recovery", "effort"].includes(metric.id))
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
    { series: bedtime, acuteLags: [0], chronic: true, journal: false, timing: "overnight" },
    { series: wakeTime, acuteLags: [0], chronic: true, journal: false, timing: "overnight" },
    { series: healthSeries(health, "sleep_regularity", "Sleep regularity", "%", "sleep_regularity"), acuteLags: [0], chronic: true, journal: false, timing: "overnight" },
    { series: healthSeries(health, "sleep_debt", "Sleep debt", "min", "cumulative_sleep_debt_minutes"), acuteLags: [0], chronic: true, journal: false, timing: "overnight" },
    { series: healthSeries(health, "steps", "Steps", "steps", "steps"), acuteLags: [0, 1, 2], chronic: true, journal: false, timing: "daytime" },
    { series: healthSeries(health, "zone_minutes", "Zone minutes", "min", "zone_minutes"), acuteLags: [0, 1, 2], chronic: true, journal: false, timing: "daytime" },
    { series: intense, acuteLags: [0, 1, 2], chronic: true, journal: false, timing: "daytime" },
    { series: exercise, acuteLags: [0, 1, 2], chronic: true, journal: false, timing: "daytime" },
    { series: healthSeries(health, "active_minutes", "Active time", "min", "active_minutes"), acuteLags: [0, 1, 2], chronic: true, journal: false, timing: "daytime" },
    { series: healthSeries(health, "skin_temperature", "Skin temperature delta", "°C", "skin_temperature_delta"), acuteLags: [0, 1, 2], chronic: true, journal: false, timing: "overnight" },
    { series: effortSeries, acuteLags: [0, 1, 2], chronic: true, journal: false, timing: "daytime" },
  ];

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
    sleep_awakenings: 1,
    deep_sleep: 5,
    rem_sleep: 5,
    hrv: 2,
    rhr: 1,
    respiratory: .3,
    spo2: .3,
    recovery: 3,
  };
  const sleepComponents = new Set(["sleep_minutes", "sleep_efficiency", "sleep_awake", "deep_sleep", "rem_sleep", "light_sleep", "sleep_debt", "daily_sleep_debt"]);
  const effortInputs = new Set(["steps", "zone_minutes", "active_energy", "exercise_minutes"]);
  const recoveryInputs = new Set(["hrv", "rhr", "sleep_minutes", "sleep_efficiency"]);
  const mechanicalPair = (relation: MatrixRelation) => {
    if (relation.predictorId === relation.outcomeId) return true;
    if (sleepComponents.has(relation.predictorId) && sleepComponents.has(relation.outcomeId)) return true;
    if ((relation.predictorId === "effort" && effortInputs.has(relation.outcomeId)) || (relation.outcomeId === "effort" && effortInputs.has(relation.predictorId))) return true;
    return (relation.predictorId === "recovery" && recoveryInputs.has(relation.outcomeId)) || (relation.outcomeId === "recovery" && recoveryInputs.has(relation.predictorId));
  };
  const excludeDerivedOutcome = (relation: MatrixRelation) => mechanicalPair(relation)
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
    .filter((metric) => !automaticIds.has(metric.id) && !["bedtime", "wake_time", "recovery", "effort"].includes(metric.id))
    .map((metric) => {
      const binary = metric.id === "active_day" || health.some((day) => typeof (day as unknown as Record<string, unknown>)[metric.field] === "boolean");
      return { series: { ...healthSeries(health, metric.id, metric.label, metric.unit, metric.field), kind: binary ? "binary" as const : "numeric" as const }, acuteLags: [0, 1, 2], chronic: true, journal: false, timing: timingForAutomaticMetric(metric.id) };
    });
  const allSpecs = [...journalRows, ...[...automaticRows, ...genericAutomaticRows].filter((row) => ["influence", "both"].includes(metricRoleFor(row.series.id, input.metricPreferences)))];
  const periods: AnalysisPeriod[] = [15, 30, 90, "all"];
  const calculatedPeriods = input.requestedPeriods ?? periods;
  const latestDate = latestLabDate(
    health.map((day) => day.metric_date),
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
  const meaningfulRelations = selectMeaningfulRelations(visibleRows.flatMap((row) => row.relations), 12);
  const acuteHighlights = selectMeaningfulRelations(visibleRows.filter((row) => row.period === 30).flatMap((row) => row.relations), 8);
  const chronicHighlights = selectMeaningfulRelations(visibleRows.filter((row) => row.period === 90 || row.period === "all").flatMap((row) => row.relations), 8);
  const topRelations = meaningfulRelations;
  return {
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

function joinObservations(health: HealthDay[], scores: ScoreDay[], calendars: CalendarDay[], checkins: DailyCheckin[]) {
  const healthByDate = new Map(health.map((row) => [row.metric_date, row]));
  const calendarByDate = new Map(calendars.map((row) => [row.metric_date, row]));
  const checkinByDate = new Map(checkins.map((row) => [row.checkin_date, row]));
  const scoresByDate = new Map<string, Partial<Record<ScoreDay["kind"], number | null>>>();
  for (const score of scores) scoresByDate.set(score.score_date, { ...(scoresByDate.get(score.score_date) ?? {}), [score.kind]: toNumber(score.score) });
  const dates = [...new Set([...healthByDate.keys(), ...calendarByDate.keys(), ...checkinByDate.keys()])].sort();
  return dates.map((date): LabObservation => {
    const day = healthByDate.get(date);
    const calendar = calendarByDate.get(date);
    const checkin = checkinByDate.get(date);
    const dayScores = scoresByDate.get(date);
    return {
      date,
      sleepMinutes: toNumber(day?.sleep_minutes),
      sleepEfficiency: toNumber(day?.sleep_efficiency),
      sleepRegularity: toNumber(day?.sleep_regularity),
      sleepDebtMinutes: toNumber(day?.cumulative_sleep_debt_minutes),
      hrv: toNumber(day?.hrv_ms),
      restingHeartRate: toNumber(day?.resting_heart_rate),
      recoveryScore: toNumber(dayScores?.recovery),
      effortScore: toNumber(dayScores?.effort),
      steps: toNumber(day?.steps),
      zoneMinutes: toNumber(day?.zone_minutes),
      deepWorkMinutes: toNumber(checkin?.deep_work_minutes_override ?? calendar?.deep_work_minutes),
      energy: toNumber(checkin?.energy),
      focus: toNumber(checkin?.focus),
      stress: toNumber(checkin?.stress),
      mood: toNumber(checkin?.mood),
      soreness: toNumber(checkin?.soreness),
      caffeine: toNumber(checkin?.caffeine_servings),
      alcohol: toNumber(checkin?.alcohol_servings),
      lateMeal: checkin?.late_meal ?? null,
      illness: checkin?.illness ?? null,
    };
  });
}

function previewData() {
  const today = new Date();
  const health: HealthDay[] = [];
  const scores: ScoreDay[] = [];
  const calendars: CalendarDay[] = [];
  const checkins: DailyCheckin[] = [];
  for (let index = 0; index < 210; index += 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - (209 - index));
    const dateString = date.toISOString().slice(0, 10);
    const rhythm = Math.sin(index * 1.73) * 24 + Math.cos(index / 7) * 11;
    const sleep = Math.round(470 + rhythm);
    const longSleep = sleep >= 480;
    const deepWork = Math.max(25, Math.round((longSleep ? 236 : 104) + Math.sin(index / 2) * 28 + (index % 5) * 4));
    const active = 42 + (index % 5) * 9;
    const vigorous = 4 + (index % 4) * 5;
    const previousVigorous = 4 + ((index + 3) % 4) * 5;
    const previewWeek = Math.floor(index / 7) % 3;
    health.push({ metric_date: dateString, sleep_minutes: sleep, sleep_efficiency: 89 + Math.sin(index / 4) * 4, sleep_latency_minutes: 14 + Math.sin(index / 3) * 4, sleep_awake_minutes: 31 + Math.cos(index / 4) * 8, sleep_awakenings: 6 + index % 5, sleep_fragmentation: .8 + (index % 5) * .12, sleep_regularity: 78 + Math.cos(index / 6) * 9, cumulative_sleep_debt_minutes: Math.max(0, 500 - sleep), hrv_ms: 50 - previousVigorous * .32 + previewWeek * .6 + Math.sin(index / 5), resting_heart_rate: 60 + previousVigorous * .16 - previewWeek * .8 + Math.sin(index / 5) * .5, steps: 7_200 + (index % 6) * 720, zone_minutes: 18 + (index % 5) * 8, bedtime: new Date(`${dateString}T22:${String(5 + index % 45).padStart(2, "0")}:00+02:00`).toISOString(), wake_time: new Date(`${dateString}T07:${String(2 + index % 28).padStart(2, "0")}:00+02:00`).toISOString(), sleep_deep_minutes: sleep * .19, sleep_rem_minutes: sleep * .23, respiratory_rate: 14.2 + Math.sin(index / 9) * .6, oxygen_saturation: 96.4 + Math.cos(index / 8) * .7, skin_temperature_delta: Math.sin(index / 11) * .25, vigorous_zone_minutes: vigorous, peak_zone_minutes: index % 5 === 0 ? 3 : 0, active_minutes: active, exercise_minutes: index % 3 === 0 ? 42 : 0 });
    scores.push(
      { score_date: dateString, kind: "sleep", score: Math.round(72 + (sleep - 450) / 5) },
      { score_date: dateString, kind: "recovery", score: Math.round(66 + (sleep - 450) / 4 + Math.sin(index / 5) * 5) },
      { score_date: dateString, kind: "effort", score: 50 + (index % 5) * 6 },
    );
    calendars.push({ metric_date: dateString, deep_work_minutes: deepWork, deep_work_event_count: deepWork ? 2 : 0, total_scheduled_minutes: deepWork + 210, synced_at: new Date().toISOString() });
    const rating = (value: number) => Math.max(1, Math.min(5, Math.round(value)));
    checkins.push({
      checkin_date: dateString,
      energy: rating(3.2 + (sleep - 470) / 48 + Math.cos(index * .73) * .7),
      focus: rating(3.3 + (sleep - 470) / 42 + Math.sin(index * .81) * .8),
      stress: index % 8 === 0 ? 4 : rating(2.3 + Math.cos(index * .57) * .7),
      mood: rating(3.4 + (sleep - 470) / 60 + Math.sin(index * .49) * .6),
      soreness: 2,
      caffeine_servings: index % 4 === 0 ? 2 : index % 3 === 0 ? 1 : 0,
      alcohol_servings: 0,
      late_meal: index % 9 === 0,
      illness: false,
      deep_work_minutes_override: null,
    });
  }
  const variables = defaultJournalVariables.map((variable, index): JournalVariable => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, name: variable.name, variableType: variable.variableType, unit: variable.unit, options: [...variable.options], position: variable.position, isActive: true, emoji: variable.emoji, defaultValue: variable.defaultValue, dayPeriod: variable.dayPeriod }));
  const yesterday = addDays(dateInTimezone("Europe/Paris"), -1);
  const entry = (name: string, value: JournalEntry["value"]): JournalEntry => ({ variableId: variables.find((variable) => variable.name === name)?.id as string, entryDate: yesterday, value });
  const journal = { variables, entries: [entry("Breakfast", true), entry("Added sugar", 18), entry("Alcohol", 0), entry("Dark room", true)], days: [{ entryDate: yesterday, status: "validated" as const, validatedAt: new Date().toISOString(), omittedVariableIds: [] }] };
  return { health, scores, calendars, checkins, journal };
}

function buildSnapshot(input: {
  user: SomaUser;
  timeZone: string;
  health: HealthDay[];
  scores: ScoreDay[];
  calendars: CalendarDay[];
  checkins: DailyCheckin[];
  journal: { variables: JournalVariable[]; entries: JournalEntry[]; days: import("@/domain/lab/journal").JournalDay[] };
  narrative: { id?: string; headline: string; summary: string; highlights: unknown; source_facts: unknown; evidence_candidates?: unknown; model: string; generated_at: string; liked?: boolean; overnight_fingerprint?: string | null } | null;
  narrativeHistory?: Array<{ id: string; headline: string; summary: string; highlights: unknown; generated_at: string; liked: boolean; source_facts: unknown; evidence_candidates?: unknown }>;
  metricPreferences?: Array<{ metric_id: string; role: MetricRole }>;
  allowNarrativeRefresh?: boolean;
  connections: Array<{ provider: string; status: string; last_synced_at: string | null }>;
  requestedPeriods?: AnalysisPeriod[];
  cachedMatrix?: PersonalLabSnapshot["matrix"];
}) {
  const observations = joinObservations(input.health, input.scores, input.calendars, input.checkins);
  const healthByDate = new Map(input.health.map((day) => [day.metric_date, day]));
  const metricPreferences = new Map((input.metricPreferences ?? []).map((item) => [item.metric_id, item.role]));
  const metricDefinitions = metricDefinitionsForHealth(input.health as unknown as Array<Record<string, unknown>>);
  const todayDate = dateInTimezone(input.timeZone);
  const todayObservation = observations.find((day) => day.date === todayDate);
  const todayCalendar = input.calendars.find((day) => day.metric_date === todayDate);
  const checkin = input.checkins.find((day) => day.checkin_date === todayDate) ?? null;
  const validatedDates = new Set(input.journal.days.filter((day) => day.status === "validated").map((day) => day.entryDate));
  const matrix = input.cachedMatrix ?? buildCorrelationMatrix({ health: input.health, observations, variables: input.journal.variables, entries: input.journal.entries, validatedDates, metricPreferences, metricDefinitions, timeZone: input.timeZone, requestedPeriods: input.requestedPeriods });
  const metricRegistry = metricDefinitions.map((metric) => {
    const sourceDays = new Map<string, number>();
    const recordedDays = metric.id === "recovery" || metric.id === "effort"
      ? input.scores.filter((score) => {
        if (score.kind !== metric.id || score.score === null) return false;
        const source = healthByDate.get(score.score_date)?.data_quality?.primaryWearable ?? "Soma";
        sourceDays.set(source, (sourceDays.get(source) ?? 0) + 1);
        return true;
      }).length
      : input.health.filter((day) => {
        const value = (day as unknown as Record<string, unknown>)[metric.field];
        if (value === null || value === undefined) return false;
        const source = day.data_quality?.primaryWearable ?? metric.source;
        sourceDays.set(source, (sourceDays.get(source) ?? 0) + 1);
        return true;
      }).length;
    return {
      ...metric,
      role: metricRoleFor(metric.id, metricPreferences),
      recordedDays,
      received: recordedDays > 0,
      sources: [...sourceDays].map(([source, days]) => ({ source, days })).sort((first, second) => second.days - first.days),
    };
  });
  const parseSourceFacts = (value: unknown) => Array.isArray(value) ? value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const fact = item as Record<string, unknown>;
    const period = fact.analysisPeriod;
    if (typeof fact.predictor !== "string" || typeof fact.outcome !== "string" || (period !== 15 && period !== 30 && period !== 90 && period !== "all")) return [];
    return [{ predictor: fact.predictor, outcome: fact.outcome, period: period as AnalysisPeriod, lagDays: typeof fact.lagDays === "number" ? fact.lagDays : 0 }];
  }) : [];
  const parseHighlights = (value: unknown) => Array.isArray(value) ? value.flatMap((item, index) => {
    if (typeof item === "string") return [{ text: item, factIndex: index }];
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;
    return typeof record.text === "string" && Number.isInteger(record.factIndex) ? [{ text: record.text, factIndex: Number(record.factIndex) }] : [];
  }) : [];
  const facts = parseSourceFacts(input.narrative?.source_facts);
  const highlights = parseHighlights(input.narrative?.highlights);
  const availableRelations = matrix.rows.flatMap((row) => row.relations);
  const sourceFacts = Array.isArray(input.narrative?.source_facts) ? input.narrative.source_facts : [];
  const requestedPeriods = new Set(input.requestedPeriods ?? [15, 30, 90, "all"]);
  const verifiableFacts = sourceFacts.filter((item) => {
    if (typeof item !== "object" || item === null) return false;
    return requestedPeriods.has((item as Record<string, unknown>).analysisPeriod as AnalysisPeriod);
  });
  const factsStillAvailable = sourceFacts.length > 0 && (verifiableFacts.length === 0 || verifiableFacts.every((item) => {
    if (typeof item !== "object" || item === null) return false;
    const fact = item as Record<string, unknown>;
    return availableRelations.some((relation) => relation.featureEligible
      && relation.predictorLabel === fact.predictor
      && relation.outcomeLabel === fact.outcome
      && relation.period === fact.analysisPeriod
      && relation.lagDays === fact.lagDays
      && relation.effect === fact.effect);
  }));
  const todayHealth = input.health.find((day) => day.metric_date === todayDate);
  const currentOvernightFingerprint = overnightFingerprint(todayHealth);
  const overnightSnapshotStable = !input.narrative?.overnight_fingerprint
    || input.narrative.overnight_fingerprint === currentOvernightFingerprint;
  const narrativeIsCurrent = Boolean(input.narrative
    && dateInTimezone(input.timeZone, input.narrative.generated_at) === todayDate
    && factsStillAvailable
    && overnightSnapshotStable);
  const history = (input.narrativeHistory ?? []).map((item) => {
    const itemFacts = parseSourceFacts(item.source_facts);
    const itemHighlights = parseHighlights(item.highlights);
    return {
      id: item.id,
      headline: item.headline,
      summary: item.summary,
      highlights: itemHighlights.map((highlight) => highlight.text),
      generatedAt: item.generated_at,
      liked: item.liked,
      sourceFacts: itemHighlights.map((highlight) => itemFacts[highlight.factIndex]).filter((fact): fact is NonNullable<typeof fact> => Boolean(fact)),
    };
  });
  const aiNarrative = input.narrative || history.length ? {
    isCurrent: narrativeIsCurrent,
    id: narrativeIsCurrent ? input.narrative?.id ?? null : null,
    headline: narrativeIsCurrent ? input.narrative?.headline ?? "" : "",
    summary: narrativeIsCurrent ? input.narrative?.summary ?? "" : "",
    highlights: narrativeIsCurrent ? highlights.map((item) => item.text) : [],
    model: narrativeIsCurrent ? input.narrative?.model ?? "" : "",
    generatedAt: narrativeIsCurrent ? input.narrative?.generated_at ?? "" : "",
    liked: narrativeIsCurrent ? input.narrative?.liked ?? false : false,
    sourceFacts: narrativeIsCurrent ? highlights.map((item) => facts[item.factIndex]).filter((fact): fact is NonNullable<typeof fact> => Boolean(fact)) : [],
    evidenceCandidates: narrativeIsCurrent ? evidenceCandidatesForNarrative(input.narrative) : [],
    history,
  } : null;
  const connection = (provider: string) => input.connections.find((item) => item.provider === provider);
  const healthConnection = connection("google_health");
  const calendarConnection = connection("google_calendar");
  return {
    todayDate,
    overnightFingerprint: currentOvernightFingerprint,
    dateLabel: new Intl.DateTimeFormat("en-US", { timeZone: input.timeZone, weekday: "long", month: "long", day: "numeric" }).format(new Date()),
    greetingName: input.user.displayName,
    checkin,
    journal: { variables: input.journal.variables, entries: input.journal.entries.filter((entry) => entry.entryDate >= addDays(todayDate, -4) && entry.entryDate <= todayDate), days: input.journal.days.filter((day) => day.entryDate >= addDays(todayDate, -4) && day.entryDate <= todayDate) },
    today: {
      sleepMinutes: todayObservation?.sleepMinutes ?? null,
      recoveryScore: todayObservation?.recoveryScore ?? null,
      effortScore: todayObservation?.effortScore ?? null,
      ...recentAverages(observations, todayDate),
      deepWorkMinutes: todayObservation?.deepWorkMinutes ?? null,
      calendarDeepWorkMinutes: todayCalendar?.deep_work_minutes ?? null,
      deepWorkSource: checkin?.deep_work_minutes_override !== null && checkin?.deep_work_minutes_override !== undefined ? "corrected" as const : todayCalendar ? "calendar" as const : "missing" as const,
      focus: todayObservation?.focus ?? null,
      energy: todayObservation?.energy ?? null,
    },
    aiNarrative,
    needsNarrativeRefresh: Boolean(input.allowNarrativeRefresh !== false
      && hasReliableOvernightData(todayHealth)
      && matrix.topRelations.length
      && !narrativeIsCurrent),
    metricRegistry,
    matrix,
    coverage: {
      healthDays: input.health.length,
      calendarDays: input.calendars.filter((day) => day.deep_work_minutes > 0).length,
      checkinDays: input.checkins.length,
      journalDays: new Set(input.journal.entries.map((entry) => entry.entryDate)).size,
      pairedDeepWorkDays: observations.filter((day) => day.sleepMinutes !== null && day.deepWorkMinutes !== null).length,
      rangeDays: observations.length,
    },
    connections: {
      health: { connected: healthConnection?.status === "connected", lastSyncedAt: healthConnection?.last_synced_at ?? null },
      calendar: { connected: calendarConnection?.status === "connected", lastSyncedAt: calendarConnection?.last_synced_at ?? null },
    },
  } satisfies PersonalLabSnapshot;
}

export async function getPersonalLabSnapshot(user: SomaUser, options: { periods?: AnalysisPeriod[] } = {}): Promise<PersonalLabSnapshot> {
  const startedAt = Date.now();
  if (isLocalPreviewMode()) {
    const preview = previewData();
    return buildSnapshot({ user, timeZone: "Europe/Paris", ...preview, requestedPeriods: options.periods, narrative: null, allowNarrativeRefresh: false, connections: [
      { provider: "google_health", status: "connected", last_synced_at: new Date().toISOString() },
      { provider: "google_calendar", status: "connected", last_synced_at: new Date().toISOString() },
    ] });
  }
  const admin = createCloudflareAdminClient();
  const analysisWindow = analysisWindowForPeriods(options.periods);
  const matrixCacheKey = labMatrixCacheKey(options.periods);
  const matrixCachePromise = matrixCacheKey ? (async () => {
    try {
      const inputRevision = await labMatrixInputRevision(user.id);
      const cache = await getLabMatrixCacheObject(user.id, matrixCacheKey) as Record<string, unknown> | null;
      const cachedMatrix = cache?.inputRevision === inputRevision
        && cache.algorithmVersion === LAB_MATRIX_CACHE_VERSION
        && isCachedMatrix(cache.matrix)
        ? cache.matrix
        : null;
      return { inputRevision, cachedMatrix };
    } catch {
      return null;
    }
  })() : Promise.resolve(null);
  const insightHistoryStart = new Date(Date.now() - 30 * 86_400_000).toISOString();
  let healthQuery = admin.from("daily_health_metrics").select("*").eq("user_id", user.id).order("metric_date", { ascending: false });
  let scoresQuery = admin.from("daily_scores").select("score_date,kind,score").eq("user_id", user.id).order("score_date", { ascending: false });
  let calendarQuery = admin.from("daily_calendar_metrics").select("metric_date,deep_work_minutes,deep_work_event_count,total_scheduled_minutes,synced_at").eq("user_id", user.id).order("metric_date", { ascending: false });
  let checkinQuery = admin.from("daily_checkins").select("checkin_date,energy,focus,stress,mood,soreness,caffeine_servings,alcohol_servings,late_meal,illness,deep_work_minutes_override").eq("user_id", user.id).order("checkin_date", { ascending: false });
  if (analysisWindow) {
    healthQuery = healthQuery.gte("metric_date", analysisWindow.start).limit(analysisWindow.days);
    scoresQuery = scoresQuery.gte("score_date", analysisWindow.start).limit(analysisWindow.days * 3);
    calendarQuery = calendarQuery.gte("metric_date", analysisWindow.start).limit(analysisWindow.days);
    checkinQuery = checkinQuery.gte("checkin_date", analysisWindow.start).limit(analysisWindow.days);
  }
  const [profileResult, healthResult, scoresResult, calendarResult, checkinResult, connectionResult, narrativeResult, narrativeHistoryResult, metricPreferenceResult, journal, matrixCache] = await Promise.all([
    admin.from("profiles").select("timezone").eq("user_id", user.id).maybeSingle(),
    healthQuery,
    scoresQuery,
    calendarQuery,
    checkinQuery,
    admin.from("provider_connections").select("provider,status,last_synced_at").eq("user_id", user.id).in("provider", ["google_health", "google_calendar"]),
    admin.from("lab_narratives").select("id,headline,summary,highlights,source_facts,evidence_candidates,model,liked,generated_at,overnight_fingerprint").eq("user_id", user.id).maybeSingle(),
    admin.from("lab_narrative_history").select("id,headline,summary,highlights,source_facts,evidence_candidates,model,liked,generated_at,overnight_fingerprint").eq("user_id", user.id).gte("generated_at", insightHistoryStart).order("generated_at", { ascending: false }).limit(31),
    admin.from("lab_metric_preferences").select("metric_id,role").eq("user_id", user.id),
    loadJournalData(user.id, analysisWindow ? { from: analysisWindow.start } : {}),
    matrixCachePromise,
  ]);
  const queryCompletedAt = Date.now();
  const failed = [profileResult, healthResult, scoresResult, calendarResult, checkinResult, connectionResult, narrativeResult, narrativeHistoryResult, metricPreferenceResult].find((result) => result.error);
  if (failed?.error) throw new Error("Your Personal Lab is temporarily unavailable.");
  const snapshot = buildSnapshot({
    user,
    timeZone: profileResult.data?.timezone ?? "Europe/Paris",
    health: (healthResult.data ?? []) as HealthDay[],
    scores: (scoresResult.data ?? []) as ScoreDay[],
    calendars: (calendarResult.data ?? []) as CalendarDay[],
    checkins: (checkinResult.data ?? []).map((row) => ({ ...row, caffeine_servings: toNumber(row.caffeine_servings), alcohol_servings: toNumber(row.alcohol_servings) })) as DailyCheckin[],
    journal,
    narrative: narrativeHistoryResult.data?.[0] ?? narrativeResult.data,
    narrativeHistory: (narrativeHistoryResult.data ?? []).map((item) => ({ id: item.id, headline: item.headline, summary: item.summary, highlights: item.highlights, generated_at: item.generated_at, liked: item.liked, source_facts: item.source_facts, evidence_candidates: item.evidence_candidates })),
    metricPreferences: (metricPreferenceResult.data ?? []) as Array<{ metric_id: string; role: MetricRole }>,
    connections: connectionResult.data ?? [],
    requestedPeriods: options.periods,
    cachedMatrix: matrixCache?.cachedMatrix ?? undefined,
  });
  if (matrixCacheKey && matrixCache && !matrixCache.cachedMatrix) {
    // Bump LAB_MATRIX_CACHE_VERSION whenever a statistical formula or matrix
    // serialization contract changes so an old result can never be reused.
    await putLabMatrixCacheObject(user.id, matrixCacheKey, {
      inputRevision: matrixCache.inputRevision,
      algorithmVersion: LAB_MATRIX_CACHE_VERSION,
      matrix: snapshot.matrix,
      calculatedAt: new Date().toISOString(),
    }).catch(() => console.warn("[personal-lab] matrix cache write failed", { period: matrixCacheKey }));
  }
  console.info("[personal-lab] snapshot ready", {
    periods: options.periods ?? [15, 30, 90, "all"],
    queryMs: queryCompletedAt - startedAt,
    calculationMs: Date.now() - queryCompletedAt,
    totalMs: Date.now() - startedAt,
    healthDays: healthResult.data?.length ?? 0,
    analysisStart: analysisWindow?.start ?? "all",
    matrixCache: matrixCache?.cachedMatrix ? "hit" : matrixCacheKey ? "miss" : "bypass",
  });
  return snapshot;
}

export async function getPersonalLabToday(user: SomaUser): Promise<PersonalLabToday> {
  if (isLocalPreviewMode()) {
    const preview = previewData();
    const todayDate = dateInTimezone("Europe/Paris");
    const observations = joinObservations(preview.health, preview.scores, preview.calendars, preview.checkins);
    const today = observations.find((day) => day.date === todayDate);
    return {
      sleepMinutes: today?.sleepMinutes ?? null,
      recoveryScore: today?.recoveryScore ?? null,
      effortScore: today?.effortScore ?? null,
      ...recentAverages(observations, todayDate),
      overnightFingerprint: overnightFingerprint(preview.health.find((day) => day.metric_date === todayDate)),
    };
  }
  const admin = createCloudflareAdminClient();
  const profileResult = await admin.from("profiles").select("timezone").eq("user_id", user.id).maybeSingle();
  if (profileResult.error) throw new Error("Today's signals could not be loaded.");
  const todayDate = dateInTimezone(profileResult.data?.timezone ?? "Europe/Paris");
  const startDate = addDays(todayDate, -29);
  const [healthResult, scoresResult] = await Promise.all([
    admin.from("daily_health_metrics").select("metric_date,sleep_minutes,bedtime,wake_time,sleep_efficiency,sleep_latency_minutes,sleep_awake_minutes,sleep_awakenings,sleep_fragmentation,sleep_deep_minutes,sleep_rem_minutes,hrv_ms,resting_heart_rate,respiratory_rate").eq("user_id", user.id).gte("metric_date", startDate).lte("metric_date", todayDate).order("metric_date", { ascending: true }),
    admin.from("daily_scores").select("score_date,kind,score").eq("user_id", user.id).gte("score_date", startDate).lte("score_date", todayDate).order("score_date", { ascending: true }),
  ]);
  if (healthResult.error || scoresResult.error) throw new Error("Today's signals could not be loaded.");
  const healthRows = (healthResult.data ?? []) as Array<Pick<HealthDay, "metric_date" | "sleep_minutes" | "bedtime" | "wake_time" | "sleep_efficiency" | "sleep_latency_minutes" | "sleep_awake_minutes" | "sleep_awakenings" | "sleep_fragmentation" | "sleep_deep_minutes" | "sleep_rem_minutes" | "hrv_ms" | "resting_heart_rate" | "respiratory_rate">>;
  const scoreRows = scoresResult.data ?? [];
  const todayHealth = healthRows.find((day) => day.metric_date === todayDate);
  const todayScores = scoreRows.filter((score) => score.score_date === todayDate);
  return {
    sleepMinutes: toNumber(todayHealth?.sleep_minutes),
    recoveryScore: toNumber(todayScores.find((score) => score.kind === "recovery")?.score),
    effortScore: toNumber(todayScores.find((score) => score.kind === "effort")?.score),
    averageSleepMinutes: average(healthRows.map((day) => toNumber(day.sleep_minutes))),
    averageRecoveryScore: average(scoreRows.filter((score) => score.kind === "recovery").map((score) => toNumber(score.score))),
    averageEffortScore: average(scoreRows.filter((score) => score.kind === "effort").map((score) => toNumber(score.score))),
    overnightFingerprint: overnightFingerprint(todayHealth),
  };
}
