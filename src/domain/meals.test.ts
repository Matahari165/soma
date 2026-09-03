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
});
