import { describe, expect, it } from "vitest";

import type { ConfirmedMealFood, ConfirmedMealRecord } from "@/domain/lab/meals";
import { DEFAULT_NUTRITION_TARGETS } from "@/domain/nutrition-targets";

import { buildMealScoreOverview } from "./meal-overview";

const targets = {
  ...DEFAULT_NUTRITION_TARGETS,
  caloriesKcal: { low: 900, likely: 1_000, high: 1_100 },
  proteinG: { low: 40, likely: 50, high: 60 },
  carbsG: { low: 100, likely: 130, high: 160 },
  fatG: { low: 20, likely: 30, high: 40 },
  fiberG: { low: 20, likely: 25, high: 30 },
};

function food(name: string, foodGroups: ConfirmedMealFood["foodGroups"] = ["vegetable"]): ConfirmedMealFood {
  return { name, varietyKey: name.toLocaleLowerCase("fr-FR"), foodGroups, novaGroup: 1, qualityProperties: ["fiber_source"] };
}

function meal(input: Partial<ConfirmedMealRecord> & Pick<ConfirmedMealRecord, "id" | "mealDate">): ConfirmedMealRecord {
  return {
    id: input.id,
    mealDate: input.mealDate,
    mealType: input.mealType ?? "lunch",
    status: "confirmed",
    entryState: input.entryState,
    origin: input.origin ?? "homemade",
    caloriesKcal: input.caloriesKcal === undefined ? { low: 1_000, likely: 1_000, high: 1_000 } : input.caloriesKcal,
    proteinG: input.proteinG === undefined ? { low: 50, likely: 50, high: 50 } : input.proteinG,
    carbsG: input.carbsG === undefined ? { low: 130, likely: 130, high: 130 } : input.carbsG,
    fatG: input.fatG === undefined ? { low: 30, likely: 30, high: 30 } : input.fatG,
    fiberG: input.fiberG === undefined ? { low: 25, likely: 25, high: 25 } : input.fiberG,
    sugarG: input.sugarG,
    addedSugarG: input.addedSugarG === undefined ? { low: 0, likely: 0, high: 0 } : input.addedSugarG,
    foods: input.foods ?? [food("courgette")],
    analysisConfidence: input.analysisConfidence ?? "high",
    mouthHeat: null,
    stomachOverfullness: null,
  };
}

describe("buildMealScoreOverview", () => {
  it("construit cinq dimensions et conserve les jours absents à null", () => {
    const overview = buildMealScoreOverview({
      date: "2026-09-15",
      targets,
      records: [meal({ id: "current", mealDate: "2026-09-15" })],
    });

    expect(overview.balanceScore?.score).toEqual(expect.any(Number));
    expect(Object.keys(overview.dimensionScores)).toHaveLength(5);
    expect(overview.scoreTrend).toHaveLength(30);
    expect(overview.scoreTrend.at(-1)?.balanceScore).toEqual(expect.any(Number));
    expect(overview.scoreTrend.at(-2)?.balanceScore).toBeNull();
    expect(overview.scoreTrend.at(-2)?.dimensionScores).toEqual({});
    expect(overview.rolling).toEqual([
      expect.objectContaining({ days: 14, observedDays: 1, readyDays: 1, totalDays: 14 }),
      expect.objectContaining({ days: 30, observedDays: 1, readyDays: 1, totalDays: 30 }),
    ]);
  });

  it("moyenne les jours observés sans utiliser de couverture cachée", () => {
    const overview = buildMealScoreOverview({
      date: "2026-09-15",
      targets,
      records: [
        meal({ id: "low", mealDate: "2026-09-14", addedSugarG: { low: 20, likely: 20, high: 20 } }),
        meal({ id: "high", mealDate: "2026-09-15", addedSugarG: { low: 0, likely: 0, high: 0 } }),
      ],
    });
    const previous = overview.scoreTrend.find((point) => point.date === "2026-09-14")?.balanceScore;
    const current = overview.scoreTrend.find((point) => point.date === "2026-09-15")?.balanceScore;

    expect(previous).not.toBeNull();
    expect(current).not.toBeNull();
    expect(overview.rolling[0]?.score).toBe(Math.round(((previous ?? 0) + (current ?? 0)) / 2));
    expect(overview.rolling[0]).not.toHaveProperty("coverage");
    expect(overview.rolling[0]).not.toHaveProperty("effectiveDays");
    expect(overview.balanceScore).not.toHaveProperty("coverage");
  });

  it("laisse l'adéquation indisponible lorsqu'un repas principal est non renseigné", () => {
    const overview = buildMealScoreOverview({
      date: "2026-09-15",
      targets,
      records: [meal({ id: "lunch", mealDate: "2026-09-15", mealType: "lunch" })],
      slotStatesByDate: new Map([
        ["2026-09-15", { breakfast: "recorded", lunch: "recorded", dinner: "not_recorded" }],
      ]),
    });

    expect(overview.balanceScore?.components.find((item) => item.key === "nutritionAdequacy")?.score).toBeNull();
    expect(overview.balanceScore?.score).toEqual(expect.any(Number));
  });

  it("retourne un aperçu sans score pour une journée sans repas", () => {
    const overview = buildMealScoreOverview({ date: "2026-09-15", targets, records: [] });

    expect(overview.balanceScore).toBeNull();
    expect(overview.dimensionScores).toEqual({});
    expect(overview.scoreTrend.every((point) => point.balanceScore === null)).toBe(true);
    expect(overview.rolling.every((item) => item.score === null && item.observedDays === 0)).toBe(true);
  });
});
