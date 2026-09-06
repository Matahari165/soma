import { describe, expect, it } from "vitest";

import { mealAnalysisSchema, normalizeMealFeeling, validateMealAnalysis } from "./meals";

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

  it("accepts optional dish provenance and structured quantity fields", () => {
    const result = mealAnalysisSchema.parse({
      summary: "Plat composé",
      foods: [{
        name: "Sauce tomate",
        preparation: "avec huile",
        portion: null,
        estimatedGrams: null,
        kind: "ingredient",
        parentId: "dish-1",
        countedInTotals: true,
        foodGroups: ["vegetable"],
        varietyKey: "tomate",
        evidence: "inferred",
        evidenceSource: "photo",
        quantity: { value: null, unit: "g", basis: "unknown", grams: null },
        calories: null,
        proteinGrams: null,
        carbohydrateGrams: null,
        fatGrams: null,
        fiberGrams: null,
        confidence: "low",
      }],
      totals: { calories: null, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null },
      confidence: "low",
      uncertainties: [],
    });

    expect(result.foods[0]).toMatchObject({ kind: "ingredient", evidence: "inferred", evidenceSource: "photo" });
    expect(result.foods[0]).toMatchObject({ foodGroups: ["vegetable"], varietyKey: "tomate" });
    expect(result.foods[0]?.quantity?.grams).toBeNull();
  });

  it("rejects contradictory sugar relationships without requiring exact sums", () => {
    const validWithUnequalSums = {
      summary: "Repas",
      foods: [{ name: "Yaourt", preparation: null, portion: null, estimatedGrams: null, calories: { low: 100, likely: 120, high: 150 }, proteinGrams: null, carbohydrateGrams: { low: 10, likely: 20, high: 30 }, fatGrams: null, fiberGrams: null, sugarGrams: { low: 4, likely: 5, high: 8 }, addedSugarGrams: { low: 1, likely: 2, high: 3 }, confidence: "medium" }],
      totals: { calories: { low: 500, likely: 600, high: 800 }, proteinGrams: null, carbohydrateGrams: { low: 40, likely: 60, high: 90 }, fatGrams: null, fiberGrams: null, sugarGrams: { low: 12, likely: 18, high: 25 }, addedSugarGrams: { low: 2, likely: 5, high: 10 } },
      confidence: "medium",
      uncertainties: [],
    };
    expect(() => validateMealAnalysis(validWithUnequalSums)).not.toThrow();

    expect(() => mealAnalysisSchema.parse({
      ...validWithUnequalSums,
      foods: [{ ...validWithUnequalSums.foods[0], sugarGrams: { low: 2, likely: 3, high: 4 }, addedSugarGrams: { low: 5, likely: 6, high: 7 } }],
    })).toThrow(/Added sugar cannot exceed total sugar/);

    expect(() => mealAnalysisSchema.parse({
      ...validWithUnequalSums,
      totals: { ...validWithUnequalSums.totals, carbohydrateGrams: { low: 5, likely: 6, high: 7 }, sugarGrams: { low: 8, likely: 9, high: 10 } },
    })).toThrow(/Total sugar cannot exceed carbohydrates/);
  });
});
