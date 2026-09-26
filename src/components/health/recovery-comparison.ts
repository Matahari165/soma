import type { ScoreDay } from "@/services/health-analytics";

export type RecoveryAverage = { value: number | null; count: number };
export type RecoveryComparisonDirection = "higher" | "lower" | "context";
export type RecoveryComparisonTone = "positive" | "negative" | "neutral";
export type RecoveryComparison = {
  tone: RecoveryComparisonTone;
  deltaLabel: string | null;
  interpretation: string | null;
  description: string;
};

function dateWindow(endDate?: string) {
  if (!endDate) return null;
  const end = new Date(`${endDate}T12:00:00.000Z`);
  if (!Number.isFinite(end.getTime())) return null;
  end.setUTCDate(end.getUTCDate() - 29);
  return { startDate: end.toISOString().slice(0, 10), endDate };
}

function averageByDate(values: Iterable<[string, number]>): RecoveryAverage {
  const measured = new Map(values);
  const readings = [...measured.values()];
  return {
    value: readings.length ? readings.reduce((sum, value) => sum + value, 0) / readings.length : null,
    count: readings.length,
  };
}

export function averageLast30Scores(scores: ScoreDay[], kind: ScoreDay["kind"], endDate?: string): RecoveryAverage {
  const window = dateWindow(endDate ?? scores.filter((item) => item.kind === kind).map((item) => item.score_date).sort().at(-1));
  if (!window) return { value: null, count: 0 };
  return averageByDate(scores
    .filter((item) => item.kind === kind && item.score_date >= window.startDate && item.score_date <= window.endDate)
    .flatMap((item) => typeof item.score === "number" && Number.isFinite(item.score) ? [[item.score_date, item.score] as [string, number]] : []));
}

export function averageLast30RecoveryDriver(scores: ScoreDay[], driverKey: string, endDate?: string): RecoveryAverage {
  const window = dateWindow(endDate);
  if (!window) return { value: null, count: 0 };
  return averageByDate(scores
    .filter((item) => item.kind === "recovery" && item.score_date >= window.startDate && item.score_date <= window.endDate)
    .flatMap((item) => {
      const value = item.drivers?.[driverKey];
      return typeof value === "number" && Number.isFinite(value) ? [[item.score_date, value] as [string, number]] : [];
    }));
}

function formatMagnitude(value: number, decimals: number) {
  return Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: decimals });
}

/** Compare like-for-like scores or readings; contextual signals never get a favorable tone. */
export function compareRecoveryValue(
  value: number | null | undefined,
  average: Pick<RecoveryAverage, "value">,
  direction: RecoveryComparisonDirection,
  decimals = 0,
  cautious = false,
): RecoveryComparison {
  if (typeof value !== "number" || !Number.isFinite(value) || average.value === null || !Number.isFinite(average.value)) {
    return { tone: "neutral", deltaLabel: null, interpretation: null, description: "30-day comparison unavailable" };
  }

  const precision = 10 ** Math.max(0, decimals);
  const shownValue = Math.round(value * precision) / precision;
  const shownAverage = Math.round(average.value * precision) / precision;
  const difference = Math.round((shownValue - shownAverage) * precision) / precision;
  if (difference === 0) return { tone: "neutral", deltaLabel: "±0", interpretation: "stable", description: "Same as the 30-day average" };

  const favorable = direction === "higher" ? difference > 0 : direction === "lower" ? difference < 0 : null;
  const tone: RecoveryComparisonTone = favorable === null ? "neutral" : favorable ? "positive" : "negative";
  const deltaLabel = `${difference > 0 ? "+" : "−"}${formatMagnitude(difference, decimals)}`;
  const interpretation = favorable === null ? null : `${cautious ? "tends " : ""}${favorable ? "favorable" : "unfavorable"}`;
  return {
    tone,
    deltaLabel,
    interpretation,
    description: `${deltaLabel} versus the 30-day average${interpretation ? `; ${interpretation}` : ""}`,
  };
}
