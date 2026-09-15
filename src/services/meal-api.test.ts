import { describe, expect, it } from "vitest";

import { legacyAnalysisToStructured, mealToApi, mealToLegacyApi } from "./meal-api";
import type { Meal } from "@/domain/meals";

const meal = {
  id: "12345678-1234-1234-1234-123456789012",
  userId: "user-1",
  mealDate: "2026-08-31",
  mealType: "lunch",
  note: null,
  status: "confirmed",
  mouthWarmthIntensity: 0,
  stomachOverfullIntensity: 0,
  createdAt: "2026-08-31T10:00:00.000Z",
  updatedAt: "2026-08-31T10:00:00.000Z",
  photos: [],
  analysis: {
    id: "analysis-1",
    mealId: "12345678-1234-1234-1234-123456789012",
    status: "completed",
    provider: "xai",
    model: "grok",
    result: {
      summary: "Repas",
      dishType: null,
      calorieAnalysis: null,
      foods: [],
      totals: { calories: { low: 400, likely: 500, high: 600 }, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null },
      confidence: "medium",
      uncertainties: [],
    },
    error: null,
    sourcePhotoIds: [],
    createdAt: "2026-08-31T10:00:00.000Z",
    completedAt: "2026-08-31T10:00:01.000Z",
  },
} satisfies Meal;

describe("legacy meal API adapter", () => {
  it("preserves explicit none and the likely nutrition estimate", () => {
    const legacy = mealToLegacyApi(meal);
    expect(legacy.mouthHeat).toBe(0);
    expect(legacy.stomachLoad).toBe(0);
    expect(legacy.analysis?.calories).toEqual({ low: 400, likely: 500, high: 600 });
    expect(legacy.entryState).toBe("recorded");
    expect(mealToApi(meal).entryState).toBe("recorded");
  });

  it("exposes a skipped state without manufacturing nutrition or analysis", () => {
    const skipped = { ...meal, status: "draft" as const, entryState: "skipped" as const, note: null, analysis: null } satisfies Meal;
    expect(mealToApi(skipped)).toMatchObject({ entryState: "skipped", note: null, analysis: null });
    expect(mealToLegacyApi(skipped)).toMatchObject({ entryState: "skipped", note: null, analysis: null });
  });

  it("does not invent a midpoint for a legacy range without likely", () => {
    expect(legacyAnalysisToStructured({ ingredients: [], calories: { low: 400, high: 600 } })).toBeNull();
  });

  it("preserves the rich food labels in the legacy response used by the journal", () => {
    const richMeal = {
      ...meal,
      analysis: {
        ...meal.analysis!,
        result: {
          ...meal.analysis!.result!,
          foods: [{ name: "Jus", portion: "250 ml", preparation: null, estimatedGrams: 250, kind: "ingredient" as const, parentId: null, course: null, countedInTotals: true, alcoholic: false, novaGroup: 4 as const, sugarExposure: { concentrated: true, liquid: true }, qualityProperties: [], observation: { portion: "observed" as const, novaGroup: "observed" as const, sugarExposure: "observed" as const, qualityProperties: "none_observed" as const }, calories: null, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null, confidence: "medium" as const }],
        },
      },
    } satisfies Meal;

    expect(mealToLegacyApi(richMeal).analysis?.ingredients[0]).toMatchObject({ alcoholic: false, novaGroup: 4, sugarExposure: { concentrated: true, liquid: true }, qualityProperties: [], observation: { qualityProperties: "none_observed" } });
  });
});
