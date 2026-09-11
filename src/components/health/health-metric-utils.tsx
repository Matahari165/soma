export type HealthMetricDirection = "higher_is_better" | "lower_is_better" | "context_only";
export type HealthMetricTone = "positive" | "negative" | "neutral";

function dateWindowEnd<T extends { metric_date: string }>(days: T[], endDate?: string) {
  if (endDate) return endDate;
  return [...days].map((day) => day.metric_date).sort().at(-1) ?? null;
}

export function averageLast30Measured<T extends { metric_date: string }, K extends keyof T>(days: T[], key: K, endDate?: string) {
  const latestDate = dateWindowEnd(days, endDate);
  if (!latestDate) return null;
  const start = new Date(`${latestDate}T12:00:00.000Z`);
  if (!Number.isFinite(start.getTime())) return null;
  start.setUTCDate(start.getUTCDate() - 29);
  const startDate = start.toISOString().slice(0, 10);
  const values: number[] = [];
  for (const day of days) {
    if (day.metric_date < startDate || day.metric_date > latestDate) continue;
    const value = day[key];
    if (typeof value === "number" && Number.isFinite(value)) values.push(value);
  }
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function metricTone(value: number | null, average: number | null, direction: HealthMetricDirection): HealthMetricTone {
  if (value === null || average === null || direction === "context_only") return "neutral";
  if (direction === "higher_is_better") return value >= average ? "positive" : "negative";
  return value <= average ? "positive" : "negative";
}

export function formatDurationMinutes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.abs(Math.round(value));
  return `${Math.floor(rounded / 60)}h ${rounded % 60}m`;
}

export function formatAverage(value: number | null, format: "number" | "decimal" | "duration", decimals = 1) {
  if (value === null) return "—";
  if (format === "duration") return formatDurationMinutes(value);
  if (format === "decimal") return value.toFixed(decimals);
  return Math.round(value).toLocaleString("fr-FR");
}
