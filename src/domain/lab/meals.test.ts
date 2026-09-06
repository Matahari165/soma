import { describe, expect, it } from "vitest";

import { aggregateConfirmedMeals, mealDailySeries, type ConfirmedMealRecord } from "./meals";

function meal(input: Partial<ConfirmedMealRecord> & Pick<ConfirmedMealRecord, "id">): ConfirmedMealRecord {
  return {
    id: input.id,
    mealDate: input.mealDate ?? "2026-08-25",
    mealType: input.mealType ?? "breakfast",
    status: "confirmed",
    origin: input.origin ?? "homemade",
    caloriesKcal: input.caloriesKcal === undefined ? { low: 400, likely: 500, high: 600 } : input.caloriesKcal,
    proteinG: input.proteinG === undefined ? { low: 20, likely: 25, high: 30 } : input.proteinG,
    carbsG: input.carbsG === undefined ? { low: 40, likely: 50, high: 60 } : input.carbsG,
    fatG: input.fatG === undefined ? { low: 10, likely: 15, high: 20 } : input.fatG,
    fiberG: input.fiberG === undefined ? { low: 4, likely: 5, high: 6 } : input.fiberG,
    foods: input.foods,
    analysisConfidence: input.analysisConfidence,
    mouthHeat: input.mouthHeat === undefined ? 0 : input.mouthHeat,
    stomachOverfullness: input.stomachOverfullness === undefined ? 0 : input.stomachOverfullness,
    photoIds: input.photoIds,
  };
}

describe("confirmed meal daily series", () => {
  it("counts one meal when several photos belong to the same meal", () => {
    const result = aggregateConfirmedMeals([
      meal({ id: "meal-1", photoIds: ["photo-a", "photo-b"] }),
      // A photo-oriented backend query can repeat the parent meal row. The
      // meal id remains the de-duplication key.
      meal({ id: "meal-1", photoIds: ["photo-b"] }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.mealCount).toBe(1);
    expect(result[0]?.mealCoverage).toBeCloseTo(100 / 4);
    expect(result[0]?.caloriesKcal).toBe(500);
  });

  it("uses the replacement analysis for the same meal id", () => {
    const result = aggregateConfirmedMeals([
      meal({ id: "meal-1", caloriesKcal: { low: 300, likely: 400, high: 500 }, mouthHeat: 1 }),
      meal({ id: "meal-1", caloriesKcal: { low: 550, likely: 650, high: 750 }, mouthHeat: 4 }),
    ]);

    expect(result[0]?.mealCount).toBe(1);
    expect(result[0]?.caloriesKcal).toBe(650);
    expect(result[0]?.mouthHeatAverage).toBe(4);
    expect(result[0]?.mouthHeatMaximum).toBe(4);
  });

  it("keeps explicit zero separate from an unanswered sensation", () => {
    const result = aggregateConfirmedMeals([
      meal({ id: "meal-1", mouthHeat: 0, stomachOverfullness: null }),
      meal({ id: "meal-2", mealType: "lunch", mouthHeat: 4, stomachOverfullness: 3 }),
    ]);

    expect(result[0]).toMatchObject({ mouthHeatAverage: 2, mouthHeatMaximum: 4, stomachOverfullnessAverage: 3, stomachOverfullnessMaximum: 3 });
    expect(mealDailySeries([
      meal({ id: "meal-3", mouthHeat: null, stomachOverfullness: null }),
    ]).meal_mouth_heat_average.points).toEqual([]);
  });

  it("does not turn a missing nutrition estimate into zero", () => {
    const result = aggregateConfirmedMeals([
      meal({ id: "meal-1", caloriesKcal: { low: 300, likely: 400, high: 500 } }),
      meal({ id: "meal-2", mealType: "lunch", caloriesKcal: null, proteinG: null }),
    ]);

    expect(result[0]?.caloriesKcal).toBeNull();
    expect(result[0]?.proteinG).toBeNull();
    expect(result[0]?.carbsG).toBe(100);
  });

  it("measures coverage by distinct meal slots, not by photo count", () => {
    const records = [
      meal({ id: "meal-1", mealType: "breakfast", photoIds: ["a", "b"] }),
      meal({ id: "meal-2", mealType: "lunch", origin: "prepared" }),
      meal({ id: "meal-3", mealType: "dinner", origin: "mixed" }),
      meal({ id: "meal-4", mealType: "snack", origin: "mixed" }),
    ];
    const result = aggregateConfirmedMeals(records);

    expect(result[0]).toMatchObject({ mealCount: 4, mealCoverage: 100, homemadeCount: 1, preparedCount: 1, mixedCount: 2, homemadeShare: 50 });
    expect(mealDailySeries(records).meal_coverage.points).toEqual([{ date: "2026-08-25", value: 100 }]);
  });

  it("aggregates each civil day independently and orders the points", () => {
    const records = [
      meal({ id: "meal-2", mealDate: "2026-08-26", mealType: "lunch" }),
      meal({ id: "meal-1", mealDate: "2026-08-25", mealType: "breakfast" }),
    ];
    expect(mealDailySeries(records).meal_count.points).toEqual([
      { date: "2026-08-25", value: 1 },
      { date: "2026-08-26", value: 1 },
    ]);
  });

  it("exposes evidence coverage and structured food signals without turning missing tags into zero", () => {
    const records = [meal({
      id: "meal-1",
      foods: [
        { name: "Tomate", varietyKey: "tomate", foodGroups: ["vegetable"], confidence: "high" },
        { name: "Riz", varietyKey: "riz", foodGroups: ["refined_grain"], confidence: "medium" },
      ],
      analysisConfidence: "medium",
    })];
    const aggregate = aggregateConfirmedMeals(records)[0];

    expect(aggregate).toMatchObject({ analysisCoverage: 100, analysisConfidence: 67, foodVarietyCount: 2, foodGroupCount: 2 });
    expect(mealDailySeries(records).meal_analysis_coverage.points).toEqual([{ date: "2026-08-25", value: 100 }]);
    expect(mealDailySeries([meal({ id: "meal-empty", foods: [] })]).meal_food_variety.points).toEqual([]);
  });
});
