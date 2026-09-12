import { describe, expect, it } from "vitest";

import { aggregateConfirmedMeals, mealDailySeries, mealFoodGroupHistory, mealNutritionHistory, type ConfirmedMealRecord } from "./meals";

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
    sugarG: input.sugarG,
    addedSugarG: input.addedSugarG,
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

    expect(result[0]?.caloriesKcal).toBe(400);
    expect(result[0]?.proteinG).toBe(25);
    expect(result[0]?.carbsG).toBe(100);
  });

  it("keeps cross-labelled food family occurrences available for the history graph", () => {
    const result = aggregateConfirmedMeals([meal({ id: "meal-labelled", foods: [
      { name: "Tomate", varietyKey: "tomate", foodGroups: ["vegetable"] },
      { name: "Lentilles", varietyKey: "lentilles", foodGroups: ["legume", "plant_protein"] },
    ] })]);

    expect(result[0]?.foodGroupCounts).toEqual({ vegetable: 1, legume: 1, plant_protein: 1 });
    expect(mealFoodGroupHistory([meal({ id: "meal-labelled", foods: [{ name: "Tomate", foodGroups: ["vegetable"] }] })], "2026-08-25", 2)).toEqual([
      { date: "2026-08-24", counts: null },
      { date: "2026-08-25", counts: { vegetable: 1 } },
    ]);
  });

  it("keeps a confirmed meal without analysis as an observation with zero coverage", () => {
    const result = aggregateConfirmedMeals([meal({
      id: "meal-unanalysed",
      caloriesKcal: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
      fiberG: null,
      foods: undefined,
    })]);

    expect(result[0]).toMatchObject({ mealCount: 1, analysisCoverage: 0, caloriesKcal: null, proteinG: null, carbsG: null, fatG: null, fiberG: null, foodVarietyCount: null, foodGroupCount: null });
    expect(mealDailySeries([meal({ id: "meal-unanalysed", caloriesKcal: null, proteinG: null, carbsG: null, fatG: null, fiberG: null })]).meal_count.points).toEqual([{ date: "2026-08-25", value: 1 }]);
    expect(mealDailySeries([meal({ id: "meal-unanalysed", caloriesKcal: null, proteinG: null, carbsG: null, fatG: null, fiberG: null })]).meal_analysis_coverage.points).toEqual([{ date: "2026-08-25", value: 0 }]);
  });

  it("leaves a day absent when there are no confirmed meal records", () => {
    expect(aggregateConfirmedMeals([])).toEqual([]);
    expect(mealDailySeries([]).meal_count.points).toEqual([]);
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

  it("keeps an explicit empty food list distinct from an absent food observation", () => {
    const absent = aggregateConfirmedMeals([meal({ id: "meal-absent", foods: undefined })])[0];
    const empty = aggregateConfirmedMeals([meal({ id: "meal-empty", foods: [] })])[0];

    expect(absent?.foodObservationCoverage).toBeNull();
    expect(empty?.foodObservationCoverage).toEqual({ qualityProperties: 0, sugarExposure: 0, novaGroup: 0, portion: 0 });
  });

  it("discounts food-axis coverage when some confirmed meals have no food list", () => {
    const aggregate = aggregateConfirmedMeals([
      meal({ id: "labelled", foods: [{ name: "Pomme", qualityProperties: ["whole_food"], sugarExposure: { liquid: false, concentrated: false }, novaGroup: 1, portion: "1" }] }),
      meal({ id: "missing", mealType: "lunch", foods: undefined }),
    ])[0];

    expect(aggregate?.foodListCoverage).toBe(0.5);
    expect(aggregate?.foodObservationCoverage).toEqual({ qualityProperties: 0.5, sugarExposure: 0.5, novaGroup: 0.5, portion: 0.5 });
  });

  it("requires both sugar-exposure flags before considering the axis observed", () => {
    const aggregate = aggregateConfirmedMeals([meal({ id: "partial", foods: [{ name: "Boisson", sugarExposure: { liquid: false, concentrated: null } }] })])[0];
    expect(aggregate?.foodObservationCoverage?.sugarExposure).toBe(0);
  });

  it("preserves structured and legacy portion evidence for the score adapter", () => {
    const result = aggregateConfirmedMeals([meal({
      id: "meal-portions",
      foods: [
        { name: "Lentilles", portion: "150 g", estimatedGrams: 150, quantity: { value: 1, unit: "portion", basis: "assiette", grams: 160 } },
        { name: "Huile", portion: null, estimatedGrams: 0, quantity: null },
      ],
    })])[0];

    expect(result?.foodObservationCoverage?.portion).toBe(1);
  });

  it("aligns nutrition trends to every calendar day without turning gaps into zero", () => {
    const history = mealNutritionHistory([
      meal({ id: "meal-early", mealDate: "2026-08-27", addedSugarG: { low: 1, likely: 2, high: 3 } }),
      meal({ id: "meal-late", mealDate: "2026-08-29", caloriesKcal: { low: 700, likely: 800, high: 900 } }),
    ], "2026-08-31", 7);

    expect(history).toHaveLength(5);
    expect(history.find((metric) => metric.id === "caloriesKcal")?.points).toEqual([
      { date: "2026-08-25", value: null },
      { date: "2026-08-26", value: null },
      { date: "2026-08-27", value: 500 },
      { date: "2026-08-28", value: null },
      { date: "2026-08-29", value: 800 },
      { date: "2026-08-30", value: null },
      { date: "2026-08-31", value: null },
    ]);
    expect(history.find((metric) => metric.id === "addedSugarG")?.points[2]).toEqual({ date: "2026-08-27", value: 2 });
  });
});
