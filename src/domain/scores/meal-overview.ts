import type { ConfirmedMealRecord, MealDailyAggregate } from "@/domain/lab/meals";
import { aggregateConfirmedMeals } from "@/domain/lab/meals";
import type { MealType } from "@/domain/meals";
import { DEFAULT_NUTRITION_TARGETS, type NutritionTargets } from "@/domain/nutrition-targets";

import {
  calculateMealBalanceScore,
  type MealBalanceComponentKey,
  type MealBalanceGoalMode,
  type MealBalanceScore,
  type MealSlotState,
} from "./meal-balance";

export type MealScoreRolling = {
  days: 14 | 30;
  score: number | null;
  observedDays: number;
  readyDays: number;
  totalDays: number;
};

export type MealScoreTrendPoint = {
  date: string;
  balanceScore: number | null;
  rawBalanceScore: number | null;
  balanceStatus: MealBalanceScore["status"] | null;
  balanceConfidence: number | null;
  /** Five dimension scores, retained for the historical detail view. */
  dimensionScores: Partial<Record<MealBalanceComponentKey, number | null>>;
  dimensionAdjustedScores: Partial<Record<MealBalanceComponentKey, number | null>>;
};

export type MealScoreOverview = {
  date: string;
  balanceScore: MealBalanceScore | null;
  /** Current dimension values are already available inside balanceScore. */
  dimensionScores: Partial<Record<MealBalanceComponentKey, number | null>>;
  trend: MealScoreTrendPoint[];
  scoreTrend: MealScoreTrendPoint[];
  rolling: MealScoreRolling[];
};

type MealTargetRanges = Pick<NutritionTargets, "caloriesKcal" | "proteinG" | "fatG" | "carbsG" | "fiberG">;

function balanceTargets(targets: MealTargetRanges): NutritionTargets {
  return {
    ...DEFAULT_NUTRITION_TARGETS,
    ...targets,
    addedSugarG: DEFAULT_NUTRITION_TARGETS.addedSugarG,
  };
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function dimensionValues(balance: MealBalanceScore | null, adjusted = false) {
  return Object.fromEntries((balance?.components ?? []).map((component) => [
    component.key,
    adjusted ? component.adjustedScore : component.score,
  ])) as Partial<Record<MealBalanceComponentKey, number | null>>;
}

function trendPoint(
  day: MealDailyAggregate,
  targets: MealTargetRanges,
  records: readonly ConfirmedMealRecord[],
  historyRecords: readonly ConfirmedMealRecord[],
  goalMode: MealBalanceGoalMode,
  slotStates: Partial<Record<MealType, MealSlotState>> | undefined,
): MealScoreTrendPoint {
  const balance = calculateMealBalanceScore({
    day,
    records,
    historyRecords,
    targets: balanceTargets(targets),
    goalMode,
    slotStates,
  });
  return {
    date: day.date,
    balanceScore: balance.score,
    rawBalanceScore: balance.rawScore,
    balanceStatus: balance.status,
    balanceConfidence: balance.confidence,
    dimensionScores: dimensionValues(balance),
    dimensionAdjustedScores: dimensionValues(balance, true),
  };
}

function emptyTrendPoint(date: string): MealScoreTrendPoint {
  return {
    date,
    balanceScore: null,
    rawBalanceScore: null,
    balanceStatus: null,
    balanceConfidence: null,
    dimensionScores: {},
    dimensionAdjustedScores: {},
  };
}

function rollingScore(scoreTrend: readonly MealScoreTrendPoint[], days: 14 | 30): MealScoreRolling {
  const points = scoreTrend.slice(-days);
  const observations = points.filter((point): point is MealScoreTrendPoint & { balanceScore: number } => point.balanceScore !== null);
  const score = observations.length
    ? Math.round(observations.reduce((sum, point) => sum + point.balanceScore, 0) / observations.length)
    : null;
  return {
    days,
    score,
    observedDays: observations.length,
    readyDays: observations.filter((point) => point.balanceStatus === "ready").length,
    totalDays: days,
  };
}

/**
 * Build the five-dimension food score and its calendar-aligned history.
 * Missing dates remain null and rolling windows average observed scores
 * equally; meal coverage is never used as a hidden weight.
 */
export function buildMealScoreOverview(input: {
  records: readonly ConfirmedMealRecord[];
  targets: MealTargetRanges;
  date: string;
  goalMode?: MealBalanceGoalMode;
  slotStatesByDate?: ReadonlyMap<string, Partial<Record<MealType, MealSlotState>>>;
}): MealScoreOverview {
  const aggregates = aggregateConfirmedMeals(input.records);
  const current = aggregates.find((day) => day.date === input.date) ?? null;
  const goalMode = input.goalMode ?? "maintain";
  const scoreTrend = Array.from({ length: 30 }, (_, index) => {
    const date = addDays(input.date, index - 29);
    const day = aggregates.find((candidate) => candidate.date === date);
    return day
      ? trendPoint(day, input.targets, input.records, input.records, goalMode, input.slotStatesByDate?.get(date))
      : emptyTrendPoint(date);
  });
  const currentBalance = current
    ? calculateMealBalanceScore({
      day: current,
      records: input.records,
      historyRecords: input.records,
      targets: balanceTargets(input.targets),
      goalMode,
      slotStates: input.slotStatesByDate?.get(input.date),
    })
    : null;
  return {
    date: input.date,
    balanceScore: currentBalance,
    dimensionScores: dimensionValues(currentBalance),
    trend: aggregates.map((day) => trendPoint(day, input.targets, input.records, input.records, goalMode, input.slotStatesByDate?.get(day.date))),
    scoreTrend,
    rolling: [14, 30].map((days) => rollingScore(scoreTrend, days as 14 | 30)),
  };
}
