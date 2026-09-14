import { describe, expect, it, afterEach } from "vitest";

import { DEFAULT_NUTRITION_TARGETS } from "@/domain/nutrition-targets";
import { loadDailyNutritionTargetsForUser, loadNutritionTargetsForUser, nutritionTargetLikelyValues, saveNutritionTargetsForUser } from "./nutrition-targets";

describe("server nutrition targets", () => {
  afterEach(() => {
    delete process.env.SOMA_LOCAL_PREVIEW;
  });

  it("persists preview targets and exposes scalar values for guidance", async () => {
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

  it("derives a preview target from the effort score and its 30-day context", async () => {
    process.env.SOMA_LOCAL_PREVIEW = "true";
    const state = await loadDailyNutritionTargetsForUser("preview-daily-target", "2026-09-12");
    expect(state).toMatchObject({ effortScore: 29, effortCoverage: 1, effortSupplementKcal: 50, effortAdjustmentApplied: true });
    expect(state.targets.caloriesKcal.likely).toBe(3000);
    expect(state.effectiveTargets.caloriesKcal.likely).toBe(3050);
  });
});
