import type { ConfirmedMealRecord, MealDailyAggregate } from "@/domain/lab/meals";
import { aggregateConfirmedMeals } from "@/domain/lab/meals";
import type { NutritionTargets } from "@/domain/nutrition-targets";

import {
  calculateMealEvidenceScore,
  calculateMealTargetScore,
  type MealEvidenceScore,
  type MealNutritionTotals,
  type MealTargetScore,
} from "./meals";

export type MealScoreTrendPoint = {
  date: string;
  targetScore: number | null;
  evidenceScore: number | null;
  analysisCoverage: number | null;
  foodVarietyCount: number | null;
  foodGroupCount: number | null;
};

export type MealScoreOverview = {
  date: string;
  targetScore: MealTargetScore | null;
  evidenceScore: MealEvidenceScore;
  foodVarietyCount: number | null;
  foodGroupCount: number | null;
  trend: MealScoreTrendPoint[];
};

type MealTargetRanges = Pick<NutritionTargets, "caloriesKcal" | "proteinG" | "fatG" | "carbsG" | "fiberG">;

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

function trendPoint(day: MealDailyAggregate, targets: MealTargetRanges): MealScoreTrendPoint {
  return {
    date: day.date,
    targetScore: targetScore(day, targets).score,
    evidenceScore: evidenceScore(day).score,
    analysisCoverage: day.analysisCoverage,
    foodVarietyCount: day.foodVarietyCount,
    foodGroupCount: day.foodGroupCount,
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
}): MealScoreOverview {
  const aggregates = aggregateConfirmedMeals(input.records);
  const current = aggregates.find((day) => day.date === input.date) ?? null;

  return {
    date: input.date,
    targetScore: current ? targetScore(current, input.targets) : null,
    evidenceScore: evidenceScore(current),
    foodVarietyCount: current?.foodVarietyCount ?? null,
    foodGroupCount: current?.foodGroupCount ?? null,
    trend: aggregates.map((day) => trendPoint(day, input.targets)),
  };
}
