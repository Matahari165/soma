import { describe, expect, it } from "vitest";

import { DEFAULT_NUTRITION_TARGETS, parseNutritionTargets } from "./nutrition-targets";

describe("nutrition target contract", () => {
  it("accepts ordered finite non-negative ranges", () => {
    expect(parseNutritionTargets(DEFAULT_NUTRITION_TARGETS)).toEqual(DEFAULT_NUTRITION_TARGETS);
    expect(parseNutritionTargets({
      ...DEFAULT_NUTRITION_TARGETS,
      proteinG: { low: 120, likely: 150, high: 190 },
    })?.proteinG).toEqual({ low: 120, likely: 150, high: 190 });
  });

  it("rejects incomplete, inverted, or negative targets", () => {
    expect(parseNutritionTargets({ ...DEFAULT_NUTRITION_TARGETS, proteinG: { low: 190, likely: 150, high: 120 } })).toBeNull();
    expect(parseNutritionTargets({ ...DEFAULT_NUTRITION_TARGETS, fiberG: { low: -1, likely: 2, high: 3 } })).toBeNull();
    expect(parseNutritionTargets({ ...DEFAULT_NUTRITION_TARGETS, caloriesKcal: undefined })).toBeNull();
  });
});
