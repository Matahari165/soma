export function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
}

export function zScore(value: number, baseline: number[]) {
  const deviation = standardDeviation(baseline);
  if (!deviation) return 0;
  return (value - mean(baseline)) / deviation;
}

export function clampScore(value: number) {
  return Math.round(Math.min(Math.max(value, 0), 100));
}

export function scoreStatus(score: number | null) {
  if (score === null) return "limited" as const;
  if (score >= 80) return "restorative" as const;
  if (score >= 60) return "steady" as const;
  return "building" as const;
}
