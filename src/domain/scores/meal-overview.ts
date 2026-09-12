import type { ConfirmedMealRecord, MealDailyAggregate } from "@/domain/lab/meals";
import { aggregateConfirmedMeals } from "@/domain/lab/meals";
import { DEFAULT_NUTRITION_TARGETS, type NutritionTargets } from "@/domain/nutrition-targets";

import {
  calculateMealEvidenceScore,
  calculateMealTargetScore,
  type MealEvidenceScore,
  type MealNutritionTotals,
  type MealTargetScore,
} from "./meals";
import {
  calculateMealBalanceScore,
  type MealBalanceGoalMode,
  type MealBalanceScore,
} from "./meal-balance";

export type MealScoreRolling = {
  days: 14 | 28;
  score: number | null;
  coveredDays: number;
  observedDays: number;
  totalDays: number;
};

export type MealScoreTrendPoint = {
  date: string;
  targetScore: number | null;
  evidenceScore: number | null;
  analysisCoverage: number | null;
  foodVarietyCount: number | null;
  foodGroupCount: number | null;
  balanceScore: number | null;
};

export type MealScoreOverview = {
  date: string;
  targetScore: MealTargetScore | null;
  balanceScore: MealBalanceScore | null;
  evidenceScore: MealEvidenceScore;
  foodVarietyCount: number | null;
  foodGroupCount: number | null;
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

function nutritionTotals(day: MealDailyAggregate): MealNutritionTotals {
  return {
    caloriesKcal: day.caloriesKcal,
    proteinG: day.proteinG,
    fatG: day.fatG,
    carbsG: day.carbsG,
    fiberG: day.fiberG,
  };
}

function evidenceScore(day: MealDailyAggregate | null): MealEvidenceScore {
  return calculateMealEvidenceScore({
    mealCoverage: day?.mealCoverage ?? null,
    analysisCoverage: day?.analysisCoverage ?? null,
    analysisConfidence: day?.analysisConfidence ?? null,
  });
}

function targetScore(day: MealDailyAggregate, targets: MealTargetRanges) {
  return calculateMealTargetScore({ totals: nutritionTotals(day), targets });
}

function trendPoint(day: MealDailyAggregate, targets: MealTargetRanges, records: readonly ConfirmedMealRecord[], goalMode: MealBalanceGoalMode): MealScoreTrendPoint {
  const balance = calculateMealBalanceScore({ day, records, targets: balanceTargets(targets), goalMode });
  return {
    date: day.date,
    targetScore: targetScore(day, targets).score,
    evidenceScore: evidenceScore(day).score,
    analysisCoverage: day.analysisCoverage,
    foodVarietyCount: day.foodVarietyCount,
    foodGroupCount: day.foodGroupCount,
    balanceScore: balance.score,
  };
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function scoreTrendPoint(date: string, day: MealDailyAggregate | undefined, targets: MealTargetRanges, records: readonly ConfirmedMealRecord[], goalMode: MealBalanceGoalMode): MealScoreTrendPoint {
  return day ? trendPoint(day, targets, records, goalMode) : {
    date,
    targetScore: null,
    evidenceScore: null,
    analysisCoverage: null,
    foodVarietyCount: null,
    foodGroupCount: null,
    balanceScore: null,
  };
}

function rollingScore(scoreTrend: readonly MealScoreTrendPoint[], days: 14 | 28): MealScoreRolling {
  const points = scoreTrend.slice(-days);
  const scores = points.map((point) => point.balanceScore).filter((value): value is number => value !== null);
  return {
    days,
    score: scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null,
    coveredDays: scores.length,
    observedDays: scores.length,
    totalDays: days,
  };
}

/**
 * Build the small, UI-agnostic meal analysis model used by score cards and
 * charts. Missing days stay absent from the trend; they are not zero scores.
 */
export function buildMealScoreOverview(input: {
  records: readonly ConfirmedMealRecord[];
  targets: MealTargetRanges;
  date: string;
  goalMode?: MealBalanceGoalMode;
}): MealScoreOverview {
  const aggregates = aggregateConfirmedMeals(input.records);
  const current = aggregates.find((day) => day.date === input.date) ?? null;
  const goalMode = input.goalMode ?? "maintain";
  const scoreTrend = Array.from({ length: 28 }, (_, index) => {
    const date = addDays(input.date, index - 27);
    return scoreTrendPoint(date, aggregates.find((day) => day.date === date), input.targets, input.records, goalMode);
  });
  const currentBalance = current
    ? calculateMealBalanceScore({ day: current, records: input.records, targets: balanceTargets(input.targets), goalMode })
    : null;

  return {
    date: input.date,
    targetScore: current ? targetScore(current, input.targets) : null,
    balanceScore: currentBalance,
    evidenceScore: evidenceScore(current),
    foodVarietyCount: current?.foodVarietyCount ?? null,
    foodGroupCount: current?.foodGroupCount ?? null,
    trend: aggregates.map((day) => trendPoint(day, input.targets, input.records, goalMode)),
    scoreTrend,
    rolling: [14, 28].map((days) => rollingScore(scoreTrend, days as 14 | 28)),
  };
}
