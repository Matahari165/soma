import type { ExerciseSummary } from "@/services/health-analytics";

export type ActivityPeriod = 7 | 14 | 30 | 60 | 90 | 180;
export type ActivityBucket = "week" | "month";
export type ActivityVolumeMetric = "sessions" | "durationMinutes";
export type ActivityMetricDirection = "higher_is_better" | "lower_is_better" | "context_only";
export type ActivityChartFormat = "number" | "decimal" | "duration" | "pace";

export type ActivityFilter = "all" | "run" | "boxing" | "hiking" | "walking" | "strength" | `other:${string}`;

export const ACTIVITY_FILTERS: { id: Exclude<ActivityFilter, `other:${string}`>; label: string; types: readonly string[] }[] = [
  { id: "all", label: "All", types: [] },
  { id: "run", label: "Running", types: ["RUN", "RUNNING", "JOGGING", "TRAIL_RUNNING", "TRAIL_RUN", "INCLINE_RUN", "TREADMILL"] },
  { id: "boxing", label: "Boxing", types: ["BOXING", "BOXE", "KICKBOXING", "MUAY_THAI"] },
  { id: "hiking", label: "Hiking", types: ["HIKING"] },
  { id: "walking", label: "Walking", types: ["WALKING"] },
  { id: "strength", label: "Strength", types: ["WEIGHT_TRAINING", "STRENGTH_TRAINING", "FUNCTIONAL_STRENGTH_TRAINING", "WEIGHTLIFTING", "WEIGHTS", "FREE_WEIGHTS", "WEIGHT_MACHINES", "POWERLIFTING"] },
];

export type ActivitySessionMetricKey =
  | "durationMinutes" | "activeMinutes" | "distanceKm" | "calories" | "averageHeartRate" | "maximumHeartRate"
  | "zoneMinutes" | "averageSpeedKph" | "averagePaceSecondsPerKm" | "elevationGainMeters" | "steps"
  | "runVo2Max" | "swimLengths" | "cadence" | "strideLengthMeters" | "groundContactMilliseconds"
  | "verticalOscillationMillimeters" | "verticalRatio" | "lightZoneMinutes" | "moderateZoneMinutes"
  | "vigorousZoneMinutes" | "peakZoneMinutes";

export type ActivitySessionMetricDefinition = {
  key: ActivitySessionMetricKey;
  label: string;
  unit?: string;
  format: ActivityChartFormat;
  digits: number;
  direction: ActivityMetricDirection;
  value: (exercise: ExerciseSummary) => number | null;
};

function zoneValue(exercise: ExerciseSummary, key: "lightMinutes" | "moderateMinutes" | "vigorousMinutes" | "peakMinutes") {
  const value = exercise.heartRateZones?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Scalar fields already extracted from a Google Health exercise record. */
export const ACTIVITY_SESSION_METRICS: readonly ActivitySessionMetricDefinition[] = [
  { key: "durationMinutes", label: "Elapsed duration", format: "duration", digits: 0, direction: "context_only", value: (exercise) => exercise.durationMinutes },
  { key: "activeMinutes", label: "Active duration", format: "duration", digits: 0, direction: "context_only", value: (exercise) => exercise.activeMinutes },
  { key: "distanceKm", label: "Distance", unit: "km", format: "decimal", digits: 2, direction: "context_only", value: (exercise) => exercise.distanceKm },
  { key: "calories", label: "Estimated calories", unit: "kcal", format: "number", digits: 0, direction: "context_only", value: (exercise) => exercise.calories },
  { key: "averageHeartRate", label: "Average heart rate", unit: "bpm", format: "number", digits: 0, direction: "context_only", value: (exercise) => exercise.averageHeartRate },
  { key: "maximumHeartRate", label: "Maximum heart rate", unit: "bpm", format: "number", digits: 0, direction: "context_only", value: (exercise) => exercise.maximumHeartRate ?? null },
  { key: "zoneMinutes", label: "Active zone minutes", unit: "min", format: "number", digits: 0, direction: "context_only", value: (exercise) => exercise.zoneMinutes },
  { key: "averageSpeedKph", label: "Average speed", unit: "km/h", format: "decimal", digits: 1, direction: "context_only", value: (exercise) => exercise.averageSpeedKph },
  { key: "averagePaceSecondsPerKm", label: "Average pace", unit: "min/km", format: "pace", digits: 0, direction: "context_only", value: (exercise) => exercise.averagePaceSecondsPerKm },
  { key: "elevationGainMeters", label: "Elevation gain", unit: "m", format: "number", digits: 0, direction: "context_only", value: (exercise) => exercise.elevationGainMeters },
  { key: "steps", label: "Steps", format: "number", digits: 0, direction: "context_only", value: (exercise) => exercise.steps },
  { key: "runVo2Max", label: "Running VO₂ max", unit: "ml/kg/min", format: "decimal", digits: 1, direction: "higher_is_better", value: (exercise) => exercise.runVo2Max },
  { key: "swimLengths", label: "Swimming lengths", format: "number", digits: 0, direction: "context_only", value: (exercise) => exercise.swimLengths },
  { key: "cadence", label: "Cadence", unit: "steps/min", format: "number", digits: 0, direction: "context_only", value: (exercise) => exercise.cadence },
  { key: "strideLengthMeters", label: "Stride length", unit: "m", format: "decimal", digits: 2, direction: "context_only", value: (exercise) => exercise.strideLengthMeters },
  { key: "groundContactMilliseconds", label: "Ground contact time", unit: "ms", format: "number", digits: 0, direction: "context_only", value: (exercise) => exercise.groundContactMilliseconds },
  { key: "verticalOscillationMillimeters", label: "Vertical oscillation", unit: "mm", format: "decimal", digits: 1, direction: "context_only", value: (exercise) => exercise.verticalOscillationMillimeters },
  { key: "verticalRatio", label: "Vertical ratio", unit: "%", format: "decimal", digits: 1, direction: "context_only", value: (exercise) => exercise.verticalRatio },
  { key: "lightZoneMinutes", label: "Light zone", unit: "min", format: "decimal", digits: 1, direction: "context_only", value: (exercise) => zoneValue(exercise, "lightMinutes") },
  { key: "moderateZoneMinutes", label: "Moderate zone", unit: "min", format: "decimal", digits: 1, direction: "context_only", value: (exercise) => zoneValue(exercise, "moderateMinutes") },
  { key: "vigorousZoneMinutes", label: "Vigorous zone", unit: "min", format: "decimal", digits: 1, direction: "context_only", value: (exercise) => zoneValue(exercise, "vigorousMinutes") },
  { key: "peakZoneMinutes", label: "Peak zone", unit: "min", format: "decimal", digits: 1, direction: "context_only", value: (exercise) => zoneValue(exercise, "peakMinutes") },
];

export function normalizeActivityType(type: string) {
  return type.trim().replaceAll("-", "_").toUpperCase();
}

export function activityFilterForType(type: string): ActivityFilter {
  const normalized = normalizeActivityType(type);
  return ACTIVITY_FILTERS.find((item) => item.id !== "all" && item.types.includes(normalized))?.id ?? `other:${normalized}`;
}

export function activityMatchesFilter(type: string, filter: ActivityFilter | string) {
  if (filter === "all") return true;
  const normalized = normalizeActivityType(type);
  if (filter.startsWith("other:")) return normalized === filter.slice("other:".length);
  return ACTIVITY_FILTERS.find((item) => item.id === filter)?.types.includes(normalized) ?? false;
}

export function activityFilterLabel(filter: ActivityFilter | string) {
  const known = ACTIVITY_FILTERS.find((item) => item.id === filter);
  if (known) return known.label;
  const raw = filter.startsWith("other:") ? filter.slice("other:".length) : filter;
  return raw.split(/[_\s]+/).filter(Boolean).map((word) => word[0]?.toUpperCase() + word.slice(1).toLowerCase()).join(" ") || "Other activity";
}

export function activityFilterOptions(exercises: readonly ExerciseSummary[]) {
  const ids = [...new Set(exercises.map((exercise) => activityFilterForType(exercise.type)))];
  const knownOrder = ACTIVITY_FILTERS.filter((item) => item.id !== "all" && ids.includes(item.id)).map((item) => item.id);
  const unknown = ids.filter((id): id is `other:${string}` => id.startsWith("other:")).sort((first, second) => activityFilterLabel(first).localeCompare(activityFilterLabel(second)));
  return [...knownOrder, ...unknown];
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function dateAtNoon(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function dateOffset(value: string, days: number) {
  const date = dateAtNoon(value);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekStart(value: string) {
  const date = dateAtNoon(value);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

export function runningWeekSummary(exercises: readonly ExerciseSummary[], referenceDate: string, timezone: string) {
  const startDate = weekStart(referenceDate);
  const seen = new Set<string>();
  const sessions = exercises.filter((exercise) => {
    if (!startDate || !activityMatchesFilter(exercise.type, "run") || seen.has(exercise.id)) return false;
    const timestamp = exercise.startTime ? new Date(exercise.startTime) : null;
    const date = timestamp && Number.isFinite(timestamp.getTime())
      ? new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(timestamp)
      : exercise.date;
    if (date < startDate || date > referenceDate) return false;
    seen.add(exercise.id);
    return true;
  });
  const durations = sessions.map((exercise) => exercise.durationMinutes).filter((value): value is number => finite(value) && value >= 0);
  return {
    startDate,
    sessions: sessions.length,
    minutes: sessions.length === 0 ? 0 : durations.length ? durations.reduce((sum, value) => sum + value, 0) : null,
    missingDurations: sessions.length - durations.length,
  };
}

function nextMonthStart(value: string) {
  const date = dateAtNoon(value);
  if (!date) return null;
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

function bucketLabel(start: string, end: string, bucket: ActivityBucket) {
  const first = dateAtNoon(start);
  const last = dateAtNoon(end);
  if (!first || !last) return `${start}–${end}`;
  if (bucket === "month" && start.slice(0, 7) === end.slice(0, 7)) {
    return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(first);
  }
  const format = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${format.format(first)} – ${format.format(last)}`;
}

function sessionTimestamp(exercise: ExerciseSummary) {
  const timestamp = exercise.startTime ? Date.parse(exercise.startTime) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : Date.parse(`${exercise.date}T12:00:00.000Z`);
}

export function activityMetricPoints(exercises: readonly ExerciseSummary[], definition: ActivitySessionMetricDefinition, timezone: string): { date: string; value: number | null; label?: string }[] {
  return [...exercises].sort((first, second) => sessionTimestamp(first) - sessionTimestamp(second)).map((exercise) => {
    const value = definition.value(exercise);
    let time: string | null = null;
    if (exercise.startTime && Number.isFinite(Date.parse(exercise.startTime))) {
      try {
        time = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(new Date(exercise.startTime));
      } catch {
        time = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(exercise.startTime));
      }
    }
    return {
      date: exercise.date,
      value: finite(value) ? value : null,
      label: `${exercise.date} · ${time ?? exercise.name}`,
    };
  });
}

export function activityMetricAverage(exercises: readonly ExerciseSummary[], definition: ActivitySessionMetricDefinition, referenceDate: string) {
  const start = dateOffset(referenceDate, -29);
  const values = exercises
    .filter((exercise) => start !== null && exercise.date >= start && exercise.date <= referenceDate)
    .map(definition.value)
    .filter(finite);
  return { value: values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : null, sampleSize: values.length };
}

export function activityVolumePoints(exercises: readonly ExerciseSummary[], referenceDate: string, days: ActivityPeriod, bucket: ActivityBucket, metric: ActivityVolumeMetric) {
  const windowStart = dateOffset(referenceDate, -(days - 1));
  if (!windowStart || !dateAtNoon(referenceDate)) return [];
  const firstBucket = bucket === "week" ? weekStart(windowStart) : `${windowStart.slice(0, 7)}-01`;
  if (!firstBucket) return [];
  let cursor: string = firstBucket;
  const points: { date: string; value: number | null; label?: string }[] = [];
  while (cursor <= referenceDate) {
    const next: string | null = bucket === "week" ? dateOffset(cursor, 7) : nextMonthStart(cursor);
    if (!next) break;
    const bucketEnd = dateOffset(next, -1);
    if (!bucketEnd) break;
    const start = cursor < windowStart ? windowStart : cursor;
    const end = bucketEnd > referenceDate ? referenceDate : bucketEnd;
    const sessions = exercises.filter((exercise) => exercise.date >= start && exercise.date <= end);
    const durations = sessions.map((exercise) => exercise.durationMinutes);
    const value = metric === "sessions"
      ? sessions.length
      : sessions.length === 0
        ? null
        : durations.length === sessions.length && durations.every(finite)
          ? durations.reduce((sum, item) => sum + item, 0)
          : null;
    points.push({ date: start, value, label: bucketLabel(start, end, bucket) });
    cursor = next;
  }
  return points;
}

export function activityVolumeAverage(exercises: readonly ExerciseSummary[], referenceDate: string, bucket: ActivityBucket, metric: ActivityVolumeMetric) {
  const start = dateOffset(referenceDate, -29);
  const sessions = exercises.filter((exercise) => start !== null && exercise.date >= start && exercise.date <= referenceDate);
  if (metric === "sessions") {
    const perBucket = sessions.length * (bucket === "week" ? 7 / 30 : 1);
    return { value: perBucket, sampleSize: sessions.length };
  }
  if (!sessions.length) return { value: null, sampleSize: 0 };
  const durations = sessions.map((exercise) => exercise.durationMinutes);
  if (!durations.every(finite)) return { value: null, sampleSize: durations.filter(finite).length };
  const total = durations.reduce((sum, item) => sum + item, 0);
  return { value: total * (bucket === "week" ? 7 / 30 : 1), sampleSize: durations.length };
}

function regularityWindow(exercises: readonly ExerciseSummary[], start: string, end: string) {
  const firstWeek = weekStart(start);
  const lastWeek = weekStart(end);
  if (!firstWeek || !lastWeek) return { activeWeeks: 0, totalWeeks: 0, percent: null as number | null };
  const allWeeks: string[] = [];
  for (let cursor: string | null = firstWeek; cursor && cursor <= lastWeek; cursor = dateOffset(cursor, 7)) allWeeks.push(cursor);
  const active = new Set(exercises
    .filter((exercise) => exercise.date >= start && exercise.date <= end)
    .map((exercise) => weekStart(exercise.date))
    .filter((value): value is string => value !== null));
  const activeWeeks = allWeeks.filter((week) => active.has(week)).length;
  return { activeWeeks, totalWeeks: allWeeks.length, percent: allWeeks.length ? Math.round((activeWeeks / allWeeks.length) * 100) : null };
}

export function activityRegularity(exercises: readonly ExerciseSummary[], referenceDate: string) {
  const currentStart = dateOffset(referenceDate, -29);
  const previousEnd = currentStart ? dateOffset(currentStart, -1) : null;
  const previousStart = previousEnd ? dateOffset(previousEnd, -29) : null;
  if (!currentStart || !previousEnd || !previousStart) return null;
  const current = regularityWindow(exercises, currentStart, referenceDate);
  const previous = regularityWindow(exercises, previousStart, previousEnd);
  if (!exercises.some((exercise) => exercise.date >= currentStart && exercise.date <= referenceDate)) {
    current.percent = null;
  }
  if (!exercises.some((exercise) => exercise.date >= previousStart && exercise.date <= previousEnd)) {
    previous.percent = null;
  }
  return {
    ...current,
    previousPercent: previous.percent,
    deltaPoints: current.percent === null || previous.percent === null ? null : current.percent - previous.percent,
  };
}
