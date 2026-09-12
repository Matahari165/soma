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

  it("accepts optional composable food labels without turning them into a score", () => {
    const result = mealAnalysisSchema.parse({
      summary: "Boisson et céréales",
      foods: [{
        name: "Jus de fruits",
        preparation: null,
        portion: "250 ml",
        estimatedGrams: null,
        novaGroup: 4,
        sugarExposure: { concentrated: true, liquid: true },
        qualityProperties: ["whole_food"],
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

    expect(result.foods[0]).toMatchObject({ novaGroup: 4, sugarExposure: { concentrated: true, liquid: true }, qualityProperties: ["whole_food"] });
  });

  it("distinguishes unknown from an examined axis with no observed property", () => {
    const result = mealAnalysisSchema.parse({
      summary: "Repas descriptif",
      foods: [
        {
          id: "food-1",
          name: "Plat préparé",
          preparation: null,
          portion: null,
          estimatedGrams: null,
          kind: "dish",
          parentId: null,
          countedInTotals: false,
          alcoholic: false,
          novaGroup: null,
          sugarExposure: null,
          observation: { portion: "unknown", novaGroup: "unknown", sugarExposure: "unknown", qualityProperties: "unknown" },
          calories: null,
          proteinGrams: null,
          carbohydrateGrams: null,
          fatGrams: null,
          fiberGrams: null,
          confidence: "low",
        },
        {
          id: "food-2",
          name: "Pomme",
          preparation: null,
          portion: "1 pièce",
          estimatedGrams: null,
          kind: "component",
          parentId: null,
          countedInTotals: true,
          alcoholic: false,
          novaGroup: 1,
          sugarExposure: { concentrated: false, liquid: false },
          qualityProperties: [],
          observation: { portion: "observed", novaGroup: "observed", sugarExposure: "none_observed", qualityProperties: "none_observed" },
          calories: null,
          proteinGrams: null,
          carbohydrateGrams: null,
          fatGrams: null,
          fiberGrams: null,
          confidence: "medium",
        },
      ],
      totals: { calories: null, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null },
      confidence: "low",
      uncertainties: ["La recette du plat préparé est inconnue."],
      uncertaintySignals: [{ code: "recipe_unknown", field: "recipe", foodId: "food-1", severity: "medium", detail: "La recette et la marque ne sont pas visibles." }],
    });

    expect(result.foods[0]?.observation?.qualityProperties).toBe("unknown");
    expect(result.foods[1]?.qualityProperties).toEqual([]);
  });

  it("validates composed-dish and alcoholic structural invariants", () => {
    const base = {
      summary: "Repas",
      foods: [
        { id: "dish-1", name: "Bowl", preparation: null, portion: null, estimatedGrams: null, kind: "dish" as const, parentId: null, countedInTotals: true, alcoholic: false, calories: null, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null, confidence: "low" as const },
        { id: "food-1", name: "Riz", preparation: null, portion: "1 bol", estimatedGrams: null, kind: "component" as const, parentId: "dish-1", countedInTotals: true, alcoholic: false, calories: null, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null, confidence: "low" as const },
      ],
      totals: { calories: null, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null },
      confidence: "low" as const,
      uncertainties: [],
    };
    expect(() => validateMealAnalysis(base)).toThrow(/counted parent dish/);

    expect(() => validateMealAnalysis({
      ...base,
      foods: [{ ...base.foods[0], kind: "component" as const, parentId: null, countedInTotals: true, alcoholic: true, calories: { low: 1, likely: 2, high: 3 } }],
    })).toThrow(/Alcoholic foods/);
  });

  it("accepts non-exact but overlapping nutrient interval sums and rejects disjoint totals", () => {
    const analysis = {
      summary: "Repas composé",
      foods: [
        { name: "Riz", preparation: null, portion: "1 portion", estimatedGrams: null, countedInTotals: true, calories: { low: 100, likely: 110, high: 120 }, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null, confidence: "medium" as const },
        { name: "Légumes", preparation: null, portion: "1 portion", estimatedGrams: null, countedInTotals: true, calories: { low: 50, likely: 55, high: 60 }, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null, confidence: "medium" as const },
      ],
      totals: { calories: { low: 140, likely: 165, high: 190 }, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null },
      confidence: "medium" as const,
      uncertainties: [],
    };
    expect(() => validateMealAnalysis(analysis)).not.toThrow();
    expect(() => validateMealAnalysis({ ...analysis, totals: { ...analysis.totals, calories: { low: 300, likely: 320, high: 340 } } })).toThrow(/interval sum/);
  });

  it("rejects contradictory structured observation statuses", () => {
    expect(() => validateMealAnalysis({
      summary: "Repas",
      foods: [{ id: "food-1", name: "Aliment", preparation: null, portion: null, estimatedGrams: null, alcoholic: false, novaGroup: null, sugarExposure: null, qualityProperties: [], observation: { portion: "unknown", novaGroup: "unknown", sugarExposure: "unknown", qualityProperties: "unknown" }, calories: null, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null, confidence: "low" }],
      totals: { calories: null, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null },
      confidence: "low",
      uncertainties: [],
    })).toThrow(/Unknown quality properties/);
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
