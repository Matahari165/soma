import { describe, expect, it } from "vitest";

import {
  DEFAULT_NUTRITION_TARGETS,
  effortTargetAdjustment,
  mergeDailyNutritionTargets,
  nutritionTargetsForEffort,
  parseNutritionTargets,
} from "./nutrition-targets";

describe("nutrition target contract", () => {
  it("accepts ordered finite non-negative ranges", () => {
    expect(parseNutritionTargets(DEFAULT_NUTRITION_TARGETS)).toEqual(DEFAULT_NUTRITION_TARGETS);
    expect(parseNutritionTargets({
      ...DEFAULT_NUTRITION_TARGETS,
      proteinG: { low: 120, likely: 150, high: 190 },
    })?.proteinG).toEqual({ low: 120, likely: 150, high: 190 });
    expect(DEFAULT_NUTRITION_TARGETS.addedSugarG).toEqual({ low: 0, likely: 0, high: 5 });
  });

  it("keeps older saved targets valid and adds the sugar guardrail", () => {
    const legacy = { ...DEFAULT_NUTRITION_TARGETS };
    delete (legacy as Partial<typeof legacy>).addedSugarG;
    expect(parseNutritionTargets(legacy)).toMatchObject({ addedSugarG: { low: 0, likely: 0, high: 5 } });
  });

  it("rejects incomplete, inverted, or negative targets", () => {
    expect(parseNutritionTargets({ ...DEFAULT_NUTRITION_TARGETS, proteinG: { low: 190, likely: 150, high: 120 } })).toBeNull();
    expect(parseNutritionTargets({ ...DEFAULT_NUTRITION_TARGETS, fiberG: { low: -1, likely: 2, high: 3 } })).toBeNull();
    expect(parseNutritionTargets({ ...DEFAULT_NUTRITION_TARGETS, caloriesKcal: undefined })).toBeNull();
  });

  it("keeps the base target below or exactly at the effort threshold", () => {
    const below = effortTargetAdjustment({ effortScore: 35, effortCoverage: 1, averageEffortScore: 40 });
    const exact = effortTargetAdjustment({ effortScore: 40, effortCoverage: 1, averageEffortScore: 40 });
    expect(below).toMatchObject({ threshold: 40, supplementKcal: 0, applied: true });
    expect(exact).toMatchObject({ threshold: 40, supplementKcal: 0, applied: true });
    expect(nutritionTargetsForEffort(DEFAULT_NUTRITION_TARGETS, { effortScore: 35, effortCoverage: 1, averageEffortScore: 40 })).toBe(DEFAULT_NUTRITION_TARGETS);
  });

  it("rounds the effort supplement to 50 kcal steps", () => {
    expect(effortTargetAdjustment({ effortScore: 47, effortCoverage: 1, averageEffortScore: 40 }).supplementKcal).toBe(50);
    expect(effortTargetAdjustment({ effortScore: 48, effortCoverage: 1, averageEffortScore: 40 }).supplementKcal).toBe(100);
    expect(nutritionTargetsForEffort(DEFAULT_NUTRITION_TARGETS, { effortScore: 47, effortCoverage: 1, averageEffortScore: 40 }).caloriesKcal).toEqual({ low: 2950, likely: 3050, high: 3150 });
  });

  it("caps the effort supplement at 300 kcal", () => {
    expect(effortTargetAdjustment({ effortScore: 100, effortCoverage: 1, averageEffortScore: 40 }).supplementKcal).toBe(300);
    expect(nutritionTargetsForEffort(DEFAULT_NUTRITION_TARGETS, { effortScore: 100, effortCoverage: 1, averageEffortScore: 40 }).caloriesKcal.likely).toBe(3300);
  });

  it("withholds the supplement when score or coverage is unavailable or unreliable", () => {
    for (const context of [
      { effortScore: null, effortCoverage: 1, averageEffortScore: 40 },
      { effortScore: 80, effortCoverage: null, averageEffortScore: 40 },
      { effortScore: 80, effortCoverage: 0.5, averageEffortScore: 40 },
    ]) {
      expect(effortTargetAdjustment(context).supplementKcal).toBe(0);
      expect(nutritionTargetsForEffort(DEFAULT_NUTRITION_TARGETS, context)).toBe(DEFAULT_NUTRITION_TARGETS);
    }
  });

  it("falls back to the safe threshold when the 30-day average is unavailable", () => {
    expect(effortTargetAdjustment({ effortScore: 50, effortCoverage: 1, averageEffortScore: null })).toMatchObject({ threshold: 40, supplementKcal: 100 });
  });

  it("keeps a measured zero distinct from unavailable effort", () => {
    expect(effortTargetAdjustment({ effortScore: 0, effortCoverage: 1, averageEffortScore: 0 })).toMatchObject({ applied: true, supplementKcal: 0 });
    expect(effortTargetAdjustment({ effortScore: null, effortCoverage: 1, averageEffortScore: 0 })).toMatchObject({ applied: false, supplementKcal: 0 });
  });

  it("does not lower a same-day target during a partial refresh", () => {
    const current = nutritionTargetsForEffort(DEFAULT_NUTRITION_TARGETS, { effortScore: 80, effortCoverage: 1, averageEffortScore: 40 });
    const next = nutritionTargetsForEffort(DEFAULT_NUTRITION_TARGETS, { effortScore: 45, effortCoverage: 1, averageEffortScore: 40 });
    expect(mergeDailyNutritionTargets({ current, next, sameDay: true, baseUnchanged: true })).toBe(current);
    expect(mergeDailyNutritionTargets({ current, next, sameDay: false, baseUnchanged: true })).toBe(next);
    expect(mergeDailyNutritionTargets({ current, next, sameDay: true, baseUnchanged: false })).toBe(next);
  });
});
