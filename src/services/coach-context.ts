export type CoachMetricRow = Record<string, unknown> & { metric_date: string };
export type CoachScoreRow = { score_date: string; kind: string; score: number | null };
export type CoachNutritionContext = {
  today: { caloriesKcal: number | null; proteinG: number | null; fatG: number | null; carbsG: number | null; fiberG: number | null };
  targets: { caloriesKcal: number; proteinG: number; fatG: number; carbsG: number; fiberG: number; surplusKcal: number };
};

export type CompactCoachHealthContext = {
  today: Record<string, unknown>;
  averages7d: Record<string, number | null>;
  averages30d: Record<string, number | null>;
  nutrition?: CoachNutritionContext;
};

function average(values: number[]) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : null;
}

export function compactHealthContext(metrics: CoachMetricRow[], scores: CoachScoreRow[]): CompactCoachHealthContext {
  const numericFields = ["sleep_minutes", "sleep_need_minutes", "sleep_regularity", "hrv_ms", "resting_heart_rate", "steps", "zone_minutes"] as const;
  const metricAverage = (field: typeof numericFields[number], days: number) => average(metrics.slice(0, days).flatMap((row) => typeof row[field] === "number" ? [row[field] as number] : []));
  const scoreAverage = (kind: string, days: number) => average(scores.filter((row) => row.kind === kind).slice(0, days).flatMap((row) => typeof row.score === "number" ? [row.score] : []));
  return {
    today: { ...(metrics[0] ?? {}), scores: Object.fromEntries(scores.filter((row) => row.score_date === metrics[0]?.metric_date).map((row) => [row.kind, row.score])) },
    averages7d: { ...Object.fromEntries(numericFields.map((field) => [field, metricAverage(field, 7)])), recovery: scoreAverage("recovery", 7), effort: scoreAverage("effort", 7) },
    averages30d: { ...Object.fromEntries(numericFields.map((field) => [field, metricAverage(field, 30)])), recovery: scoreAverage("recovery", 30), effort: scoreAverage("effort", 30) },
  };
}
