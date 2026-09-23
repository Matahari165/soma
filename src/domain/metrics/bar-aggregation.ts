import type { MetricPoint } from "./trends";

export type BarAggregation = "day" | "week";

function weekStart(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

/** A weekly bar averages measured daily values; a missing day never becomes zero. */
export function aggregateBarPoints(points: MetricPoint[], aggregation: BarAggregation): MetricPoint[] {
  if (aggregation === "day") return points;
  const grouped = new Map<string, number[] | null>();
  for (const point of points) {
    const week = weekStart(point.date);
    if (!week) continue;
    if (typeof point.value !== "number" || !Number.isFinite(point.value)) {
      if (!grouped.has(week)) grouped.set(week, null);
      continue;
    }
    const values = grouped.get(week);
    if (values === null || values === undefined) grouped.set(week, [point.value]);
    else values.push(point.value);
  }
  return [...grouped.entries()].sort(([first], [second]) => first.localeCompare(second)).map(([date, values]) => ({
    date,
    value: values?.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
  }));
}
