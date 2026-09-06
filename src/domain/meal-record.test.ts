import { describe, expect, it } from "vitest";

import { apiMealToRecord, MEAL_SLOTS } from "./meal-record";

describe("meal record server boundary", () => {
  it("keeps the page adapter in a shared, server-safe module", () => {
    expect(MEAL_SLOTS).toEqual(["breakfast", "lunch", "snack", "dinner"]);
    expect(apiMealToRecord({ id: "meal-server", mealDate: "2026-09-05", mealType: "lunch", status: "draft", photos: [] })).toMatchObject({
      id: "meal-server",
      date: "2026-09-05",
      slot: "lunch",
      status: "draft",
    });
  });

  it("keeps structured food signals when adapting a confirmed analysis", () => {
    const record = apiMealToRecord({
      id: "meal-structured",
      mealDate: "2026-09-05",
      mealType: "lunch",
      status: "confirmed",
      photos: [],
      analysis: {
        status: "completed",
        id: "analysis-structured",
        result: {
          summary: "Repas structuré",
          foods: [{ name: "Tomate", preparation: null, portion: null, estimatedGrams: null, foodGroups: ["vegetable"], varietyKey: "tomate", calories: null, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null, confidence: "high" }],
          totals: { calories: null, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null },
          confidence: "high",
          uncertainties: [],
        },
      },
    });

    expect(record.analysis?.ingredients[0]).toMatchObject({ foodGroups: ["vegetable"], varietyKey: "tomate" });
  });
});
