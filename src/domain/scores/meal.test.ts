import { describe, expect, it } from "vitest";

import { calculateMealEvidenceScore, calculateMealTargetScore, scoreAgainstTarget } from "./meals";

const targets = {
  caloriesKcal: { low: 2900, likely: 3000, high: 3100 },
  proteinG: { low: 150, likely: 160, high: 170 },
  fatG: { low: 70, likely: 80, high: 90 },
  carbsG: { low: 350, likely: 385, high: 420 },
  fiberG: { low: 25, likely: 30, high: 35 },
};

describe("meal score engines", () => {
  it("gives full alignment inside every personal target band", () => {
    const result = calculateMealTargetScore({
      totals: { caloriesKcal: 3000, proteinG: 160, fatG: 80, carbsG: 385, fiberG: 30 },
      targets,
    });

    expect(result).toMatchObject({ score: 100, status: "ready", coverage: 1, missing: [] });
    expect(result.components).toEqual({ caloriesKcal: 100, proteinG: 100, fatG: 100, carbsG: 100, fiberG: 100 });
  });

  it("keeps a partial score limited and refuses a single dimension", () => {
    const partial = calculateMealTargetScore({
      totals: { caloriesKcal: 3000, proteinG: 160, fatG: null, carbsG: null, fiberG: null },
      targets,
    });
    const single = calculateMealTargetScore({
      totals: { caloriesKcal: 3000, proteinG: null, fatG: null, carbsG: null, fiberG: null },
      targets,
    });

    expect(partial).toMatchObject({ score: 100, status: "limited", coverage: 0.6 });
    expect(single).toMatchObject({ score: null, status: "limited", coverage: 0.35 });
  });

  it("does not reward an amount above the target band as if it were exact", () => {
    expect(scoreAgainstTarget(0, { low: 100, likely: 150, high: 200 })).toBe(0);
    expect(scoreAgainstTarget(400, { low: 100, likely: 150, high: 200 })).toBe(50);
  });

  it("keeps evidence quality distinct from nutritional alignment", () => {
    const result = calculateMealEvidenceScore({ mealCoverage: 100, analysisCoverage: 80, analysisConfidence: 67 });

    expect(result).toMatchObject({ score: 79, status: "ready", coverage: 1 });
    expect(result.algorithmVersion).toBe("meal-evidence-v1");
  });
});
