import { describe, expect, it, afterEach } from "vitest";

import { DEFAULT_NUTRITION_TARGETS } from "@/domain/nutrition-targets";
import { loadNutritionTargetsForUser, nutritionTargetLikelyValues, saveNutritionTargetsForUser } from "./nutrition-targets";

describe("server nutrition targets", () => {
  afterEach(() => {
    delete process.env.SOMA_LOCAL_PREVIEW;
  });

  it("persists preview targets and exposes scalar values for Coach", async () => {
    process.env.SOMA_LOCAL_PREVIEW = "true";
    const targets = { ...DEFAULT_NUTRITION_TARGETS, caloriesKcal: { low: 3000, likely: 3200, high: 3400 } };
    await saveNutritionTargetsForUser("preview-target-user", targets);
    expect(await loadNutritionTargetsForUser("preview-target-user")).toEqual(targets);
    expect(nutritionTargetLikelyValues(targets)).toMatchObject({ caloriesKcal: 3200, proteinG: 160, surplusKcal: 300 });
  });

  it("returns defaults for a preview user with no saved target", async () => {
    process.env.SOMA_LOCAL_PREVIEW = "true";
    expect(await loadNutritionTargetsForUser("preview-target-empty")).toEqual(DEFAULT_NUTRITION_TARGETS);
  });
});
