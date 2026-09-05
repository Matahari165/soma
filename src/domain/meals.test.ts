import { describe, expect, it } from "vitest";

import { mealAnalysisSchema, normalizeMealFeeling } from "./meals";

describe("meal domain", () => {
  it("keeps explicit none separate from an unanswered feeling", () => {
    expect(normalizeMealFeeling("none")).toBe(0);
    expect(normalizeMealFeeling(undefined)).toBeNull();
    expect(normalizeMealFeeling(5)).toBe(5);
  });

  it("requires low, likely, and high nutrition estimates in order", () => {
    expect(() => mealAnalysisSchema.parse({ summary: "Meal", foods: [], totals: { calories: { low: 500, likely: 450, high: 600 }, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null }, confidence: "low", uncertainties: [] })).toThrow();
  });

  it("accepts separate total and added sugar ranges", () => {
    const result = mealAnalysisSchema.parse({
      summary: "Banane et yaourt",
      foods: [{ name: "Banane", preparation: null, portion: "1", estimatedGrams: null, calories: null, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null, sugarGrams: { low: 10, likely: 12, high: 15 }, addedSugarGrams: null, confidence: "medium" }],
      totals: { calories: null, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null, sugarGrams: { low: 10, likely: 12, high: 15 }, addedSugarGrams: null },
      confidence: "medium",
      uncertainties: [],
    });
    expect(result.totals.sugarGrams?.likely).toBe(12);
    expect(result.totals.addedSugarGrams).toBeNull();
  });
});
