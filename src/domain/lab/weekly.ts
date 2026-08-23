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

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function aggregatePairedWeekly(
  predictor: MatrixPoint[],
  outcome: MatrixPoint[],
  lagDays = 0,
  minimumPairedDays = 4,
) {
  const outcomeByDate = new Map(outcome.map((point) => [point.date, point]));
  const grouped = new Map<string, Array<{ predictor: number; outcome: number; segment?: string }>>();
  for (const predictorPoint of predictor) {
    const outcomePoint = outcomeByDate.get(addDays(predictorPoint.date, lagDays));
    if (!outcomePoint) continue;
    if (predictorPoint.segment && outcomePoint.segment && predictorPoint.segment !== outcomePoint.segment) continue;
    const week = weekStart(predictorPoint.date);
    grouped.set(week, [...(grouped.get(week) ?? []), {
      predictor: predictorPoint.value,
      outcome: outcomePoint.value,
      segment: predictorPoint.segment ?? outcomePoint.segment,
    }]);
  }
  const pairedWeeks = [...grouped]
    .filter(([, pairs]) => pairs.length >= minimumPairedDays && new Set(pairs.map((pair) => pair.segment).filter(Boolean)).size <= 1)
    .map(([date, pairs]) => ({
      date,
      predictor: pairs.reduce((sum, pair) => sum + pair.predictor, 0) / pairs.length,
      outcome: pairs.reduce((sum, pair) => sum + pair.outcome, 0) / pairs.length,
      segment: pairs.find((pair) => pair.segment)?.segment,
      pairedDays: pairs.length,
    }))
    .sort((first, second) => first.date.localeCompare(second.date));
  return {
    predictor: pairedWeeks.map(({ date, predictor: value, segment }) => ({ date, value, segment })),
    outcome: pairedWeeks.map(({ date, outcome: value, segment }) => ({ date, value, segment })),
    pairedDaysByWeek: pairedWeeks.map(({ date, pairedDays }) => ({ date, pairedDays })),
  };
}
