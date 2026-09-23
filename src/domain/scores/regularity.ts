function circularDifference(first: number, second: number) {
  // JavaScript keeps the sign of the dividend for `%`. Normalize the
  // remainder before measuring a difference across midnight.
  const normalized = ((first - second + 720) % 1440 + 1440) % 1440;
  return Math.abs(normalized - 720);
}

export function sleepRegularityScore(
  nights: Array<{ bedtimeMinutes: number; wakeMinutes: number }>,
) {
  if (nights.length < 3) return null;
  const reference = nights.slice(0, -1);
  const current = nights.at(-1) as { bedtimeMinutes: number; wakeMinutes: number };
  const averageBedtime = circularMean(reference.map((night) => night.bedtimeMinutes));
  const averageWake = circularMean(reference.map((night) => night.wakeMinutes));
  const averageDifference = (
    circularDifference(current.bedtimeMinutes, averageBedtime) +
    circularDifference(current.wakeMinutes, averageWake)
  ) / 2;
  return Math.round(Math.max(0, 100 - (averageDifference / 120) * 100));
}

export function circularMean(values: number[]) {
  const radians = values.map((value) => (value / 1440) * 2 * Math.PI);
  const sine = radians.reduce((sum, value) => sum + Math.sin(value), 0) / values.length;
  const cosine = radians.reduce((sum, value) => sum + Math.cos(value), 0) / values.length;
  const angle = Math.atan2(sine, cosine);
  return Math.round((((angle < 0 ? angle + 2 * Math.PI : angle) / (2 * Math.PI)) * 1440) % 1440);
}
