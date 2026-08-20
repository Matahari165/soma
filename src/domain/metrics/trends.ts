export type TrendDirection = "higher_is_better" | "lower_is_better" | "context_only";

export type MetricPoint = { date: string; value: number | null };

export type PeriodComparison = {
  days: 7 | 30 | 90;
  average: number | null;
  absoluteDelta: number | null;
  percentDelta: number | null;
  sampleSize: number;
};

export type TrendSummary = {
  current: number | null;
  currentDate: string | null;
  comparisons: PeriodComparison[];
  variability30d: number | null;
  sustainedChange: "improving" | "declining" | "stable" | "insufficient";
};

function dayNumber(value: string) {
  const parsed = Date.parse(`${value.slice(0, 10)}T12:00:00.000Z`);
  return Number.isFinite(parsed) ? Math.floor(parsed / 86_400_000) : null;
}

export function filterCalendarWindow(points: MetricPoint[], days: 7 | 30 | 90) {
  const latestDay = [...points].reverse().map((point) => dayNumber(point.date)).find((value): value is number => value !== null);
  if (latestDay === undefined) return [];
  return points.filter((point) => {
    const day = dayNumber(point.date);
    return day !== null && day >= latestDay - days + 1 && day <= latestDay;
  });
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function standardDeviation(values: number[]) {
  const average = mean(values);
  if (average === null || values.length < 2) return null;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

export function summarizeTrend(points: MetricPoint[], direction: TrendDirection): TrendSummary {
  const available = points.filter((point): point is { date: string; value: number } => point.value !== null);
  const latest = available.at(-1);
  const current = latest?.value ?? null;
  const latestDay = latest ? dayNumber(latest.date) : null;
  const comparisons = ([7, 30, 90] as const).map((days) => {
    const values = latestDay === null ? [] : available.filter((point) => {
      const day = dayNumber(point.date);
      return day !== null && day < latestDay && day >= latestDay - days;
    }).map((point) => point.value);
    const average = mean(values);
    const absoluteDelta = current === null || average === null ? null : current - average;
    const percentDelta = absoluteDelta === null || average === null || average === 0 ? null : (absoluteDelta / Math.abs(average)) * 100;
    return { days, average, absoluteDelta, percentDelta, sampleSize: values.length };
  });

  const recent = latestDay === null ? [] : available.filter((point) => {
    const day = dayNumber(point.date);
    return day !== null && day <= latestDay && day >= latestDay - 2;
  }).map((point) => point.value);
  const baseline = latestDay === null ? [] : available.filter((point) => {
    const day = dayNumber(point.date);
    return day !== null && day < latestDay - 2 && day >= latestDay - 32;
  }).map((point) => point.value);
  let sustainedChange: TrendSummary["sustainedChange"] = "insufficient";
  if (recent.length === 3 && baseline.length >= 14) {
    const recentMean = mean(recent) as number;
    const baselineMean = mean(baseline) as number;
    const deviation = standardDeviation(baseline) ?? 0;
    const meaningful = deviation > 0 ? Math.abs(recentMean - baselineMean) >= deviation : recentMean !== baselineMean;
    if (!meaningful || direction === "context_only") sustainedChange = "stable";
    else {
      const higher = recentMean > baselineMean;
      const favorable = direction === "higher_is_better" ? higher : !higher;
      sustainedChange = favorable ? "improving" : "declining";
    }
  }

  return {
    current,
    currentDate: latest?.date ?? null,
    comparisons,
    variability30d: standardDeviation(filterCalendarWindow(available, 30).map((point) => point.value as number)),
    sustainedChange,
  };
}
