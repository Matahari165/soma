import type { HealthMetricTone } from "./health-metric-utils";

export type SleepComparisonDirection = "higher_is_better" | "lower_is_better";

function measured(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function sleepMetricTone(value: number | null | undefined, baseline: number | null | undefined, direction: SleepComparisonDirection): HealthMetricTone {
  if (!measured(value) || !measured(baseline)) return "neutral";
  const shownValue = Math.round(value);
  const shownBaseline = Math.round(baseline);
  if (shownValue === shownBaseline) return "neutral";
  const favorable = direction === "higher_is_better" ? shownValue > shownBaseline : shownValue < shownBaseline;
  return favorable ? "positive" : "negative";
}

/** Duration meets the score target at estimated need; more time adds no score credit. */
export function sleepNeedTone(value: number | null | undefined, estimatedNeed: number | null | undefined): HealthMetricTone {
  if (!measured(value) || !measured(estimatedNeed) || estimatedNeed <= 0) return "neutral";
  return Math.round(value) >= Math.round(estimatedNeed) ? "positive" : "negative";
}

export function sleepMetricComparisonLabel(value: number | null | undefined, baseline: number | null | undefined, direction: SleepComparisonDirection) {
  if (!measured(value) || !measured(baseline)) return "30-day comparison unavailable";
  const shownValue = Math.round(value);
  const shownBaseline = Math.round(baseline);
  if (shownValue === shownBaseline) return "At 30-day average";
  const above = shownValue > shownBaseline;
  const favorable = direction === "higher_is_better" ? above : !above;
  return `${above ? "Above" : "Below"} 30-day average · ${favorable ? "favorable" : "unfavorable"}`;
}

export function sleepNeedComparisonLabel(value: number | null | undefined, estimatedNeed: number | null | undefined) {
  if (!measured(value)) return "Sleep duration unavailable";
  if (!measured(estimatedNeed) || estimatedNeed <= 0) return "Estimated sleep need unavailable";
  return Math.round(value) >= Math.round(estimatedNeed) ? "Estimated sleep need met" : "Below estimated sleep need";
}
