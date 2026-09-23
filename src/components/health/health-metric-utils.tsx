import { formatDurationMinutes as formatLocaleDuration, formatNumber } from "@/lib/locale";

export type HealthMetricDirection = "higher_is_better" | "lower_is_better" | "context_only";
export type HealthMetricTone = "positive" | "negative" | "neutral";

type HealthSourceFreshness = {
  metric_date?: string | null;
  data_quality?: {
    source?: string | null;
    providers?: string[];
    primaryWearable?: string | null;
    sourceDevices?: string[];
    importedAt?: string | null;
  };
  source_freshness?: {
    latestMeasuredAt?: string | null;
    byType?: Record<string, string | null>;
  };
};

/** Returns a human readable source without guessing when provenance is absent. */
export function healthSourceLabel(day: HealthSourceFreshness | null | undefined) {
  const provenance = day?.data_quality;
  const values = [
    provenance?.source,
    ...(provenance?.providers ?? []),
    provenance?.primaryWearable,
    ...(provenance?.sourceDevices ?? []),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.toLowerCase());
  if (values.some((value) => value.includes("apple_health") || value.includes("apple health") || value.includes("apple watch"))) return "Apple Health";
  if (values.some((value) => value.includes("google_health") || value.includes("google health"))) return "Google Health";
  if (values.some((value) => value.includes("whoop"))) return "WHOOP";
  if (values.length > 1) return "Health sources";
  return "Health source";
}

/** Counts only finite readings; null, undefined and invalid numbers stay absent. */
export function measuredCoverage(values: Array<number | null | undefined>) {
  if (!values.length) return 0;
  const measured = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return measured.length / values.length;
}

/** Returns the newest valid source timestamp across every imported signal. */
export function latestSourceMeasuredAt(day: HealthSourceFreshness | null | undefined) {
  const candidates = [
    day?.source_freshness?.latestMeasuredAt,
    ...Object.values(day?.source_freshness?.byType ?? {}),
  ].filter((value): value is string => typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value)));
  const latest = candidates.reduce<string | null>((current, candidate) => {
    if (!current || Date.parse(candidate) > Date.parse(current)) return candidate;
    return current;
  }, null);
  return latest ?? day?.metric_date ?? null;
}

function dateWindowEnd<T extends { metric_date: string }>(days: T[], endDate?: string) {
  if (endDate) return endDate;
  return [...days].map((day) => day.metric_date).sort().at(-1) ?? null;
}

export function averageLast30Measured<T extends { metric_date: string }, K extends keyof T>(days: T[], key: K, endDate?: string) {
  return averageLast30MeasuredWithCount(days, key, endDate).value;
}

export function averageLast30MeasuredWithCount<T extends { metric_date: string }, K extends keyof T>(days: T[], key: K, endDate?: string) {
  const latestDate = dateWindowEnd(days, endDate);
  if (!latestDate) return { value: null, measuredDays: 0 };
  const start = new Date(`${latestDate}T12:00:00.000Z`);
  if (!Number.isFinite(start.getTime())) return { value: null, measuredDays: 0 };
  start.setUTCDate(start.getUTCDate() - 29);
  const startDate = start.toISOString().slice(0, 10);
  const values: number[] = [];
  for (const day of days) {
    if (day.metric_date < startDate || day.metric_date > latestDate) continue;
    const value = day[key];
    if (typeof value === "number" && Number.isFinite(value)) values.push(value);
  }
  return {
    value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    measuredDays: values.length,
  };
}

export function metricTone(value: number | null, average: number | null, direction: HealthMetricDirection): HealthMetricTone {
  if (value === null || average === null || direction === "context_only") return "neutral";
  if (direction === "higher_is_better") return value >= average ? "positive" : "negative";
  return value <= average ? "positive" : "negative";
}

export function formatDurationMinutes(value: number | null) {
  return formatLocaleDuration(value);
}

export function formatAverage(value: number | null, format: "number" | "decimal" | "duration", decimals = 1) {
  if (value === null) return "—";
  if (format === "duration") return formatDurationMinutes(value);
  if (format === "decimal") return formatNumber(value, { maximumFractionDigits: decimals });
  return formatNumber(Math.round(value));
}
