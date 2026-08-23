import type { MatrixPoint } from "./matrix";

export function weekStart(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return value.toISOString().slice(0, 10);
}

export function aggregateWeekly(points: MatrixPoint[], mode: "sum" | "mean", allowedWeeks: Set<string>, minimumDays: number) {
  const grouped = new Map<string, MatrixPoint[]>();
  for (const point of points) {
    const week = weekStart(point.date);
    grouped.set(week, [...(grouped.get(week) ?? []), point]);
  }
  return [...grouped]
    .filter(([date, values]) => allowedWeeks.has(date) && values.length >= minimumDays && new Set(values.map((point) => point.segment).filter(Boolean)).size <= 1)
    .map(([date, values]) => ({
      date,
      value: mode === "sum" ? values.reduce((sum, point) => sum + point.value, 0) : values.reduce((sum, point) => sum + point.value, 0) / values.length,
      segment: values.find((point) => point.segment)?.segment,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
