import { describe, expect, it } from "vitest";

import type { ConfirmedMealRecord } from "@/domain/lab/meals";

import { buildMealScoreOverview } from "./meal-overview";

const targets = {
  caloriesKcal: { low: 900, likely: 1000, high: 1100 },
  proteinG: { low: 40, likely: 50, high: 60 },
  fatG: { low: 20, likely: 30, high: 40 },
  carbsG: { low: 100, likely: 130, high: 160 },
  fiberG: { low: 15, likely: 20, high: 25 },
};

function meal(input: Partial<ConfirmedMealRecord> & Pick<ConfirmedMealRecord, "id" | "mealDate">): ConfirmedMealRecord {
  return {
    id: input.id,
    mealDate: input.mealDate,
    mealType: input.mealType ?? "lunch",
    status: "confirmed",
    origin: input.origin ?? "homemade",
    caloriesKcal: input.caloriesKcal === undefined ? { low: 950, likely: 1000, high: 1050 } : input.caloriesKcal,
    proteinG: input.proteinG === undefined ? { low: 45, likely: 50, high: 55 } : input.proteinG,
    carbsG: input.carbsG === undefined ? { low: 120, likely: 130, high: 140 } : input.carbsG,
    fatG: input.fatG === undefined ? { low: 25, likely: 30, high: 35 } : input.fatG,
    fiberG: input.fiberG === undefined ? { low: 18, likely: 20, high: 22 } : input.fiberG,
    foods: input.foods,
    analysisConfidence: input.analysisConfidence,
    mouthHeat: null,
    stomachOverfullness: null,
  };
}

describe("buildMealScoreOverview", () => {
  it("returns current scores and a sparse trend without converting unknown days to zero", () => {
    const overview = buildMealScoreOverview({
      date: "2026-09-06",
      targets,
      records: [
        meal({
          id: "meal-current",
          mealDate: "2026-09-06",
          analysisConfidence: "high",
          foods: [
            { name: "Tomate", varietyKey: "tomate", foodGroups: ["vegetable"] },
            { name: "Riz", varietyKey: "riz", foodGroups: ["refined_grain"] },
          ],
        }),
        meal({ id: "meal-previous", mealDate: "2026-09-04", proteinG: null }),
      ],
    });

    expect(overview.targetScore).toMatchObject({ score: 100, status: "ready", coverage: 1 });
    expect(overview.evidenceScore.components).toMatchObject({ mealCoverage: 25, analysisCoverage: 100, analysisConfidence: 100 });
    expect(overview.foodVarietyCount).toBe(2);
    expect(overview.foodGroupCount).toBe(2);
    expect(overview.balanceScore?.score).toEqual(expect.any(Number));
    expect(overview.rolling).toEqual([
      expect.objectContaining({ days: 14, coveredDays: 2, totalDays: 14 }),
      expect.objectContaining({ days: 28, coveredDays: 2, totalDays: 28 }),
    ]);
    expect(overview.scoreTrend).toHaveLength(28);
    expect(overview.scoreTrend.at(-2)?.balanceScore).toBeNull();
    expect(overview.trend).toEqual([
      expect.objectContaining({ date: "2026-09-04", targetScore: 100 }),
      expect.objectContaining({ date: "2026-09-06", targetScore: 100, evidenceScore: 85 }),
    ]);
  });

  it("keeps a day without a confirmed meal distinguishable from a limited score", () => {
    const overview = buildMealScoreOverview({ records: [], targets, date: "2026-09-06" });

    expect(overview.targetScore).toBeNull();
    expect(overview.evidenceScore.score).toBeNull();
    expect(overview.foodVarietyCount).toBeNull();
    expect(overview.trend).toEqual([]);
  });
});
