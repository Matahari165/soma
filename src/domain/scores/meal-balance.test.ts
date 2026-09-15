import { describe, expect, it } from "vitest";

import { aggregateConfirmedMeals, type ConfirmedMealFood, type ConfirmedMealRecord } from "@/domain/lab/meals";
import { DEFAULT_NUTRITION_TARGETS, type NutritionTargets } from "@/domain/nutrition-targets";

import {
  calculateMealBalanceScore,
  MEAL_BALANCE_ALGORITHM_VERSION,
  MEAL_BALANCE_COMPONENT_ORDER,
  MEAL_BALANCE_COMPONENT_WEIGHTS,
  MEAL_BALANCE_NEUTRAL_BASE,
  MEAL_BALANCE_NORMALIZED_COMPONENT_WEIGHTS,
  MEAL_BALANCE_SUGAR_SEVERE_CAP,
  MEAL_BALANCE_WEIGHT_TOTAL,
  scoreEnergyForMealBalance,
  scoreSugarLoadForMealBalance,
} from "./meal-balance";

const targets: NutritionTargets = {
  ...DEFAULT_NUTRITION_TARGETS,
  caloriesKcal: { low: 900, likely: 1_000, high: 1_100 },
  proteinG: { low: 40, likely: 50, high: 60 },
  carbsG: { low: 100, likely: 130, high: 160 },
  fatG: { low: 20, likely: 30, high: 40 },
  fiberG: { low: 20, likely: 25, high: 30 },
};

function estimate(likely: number) {
  return { low: likely, likely, high: likely };
}

function food(name: string, overrides: Partial<ConfirmedMealFood> = {}): ConfirmedMealFood {
  return { name, varietyKey: name.toLocaleLowerCase("fr-FR"), ...overrides };
}

function meal(input: Partial<ConfirmedMealRecord> & Pick<ConfirmedMealRecord, "id">): ConfirmedMealRecord {
  return {
    id: input.id,
    mealDate: input.mealDate ?? "2026-09-15",
    mealType: input.mealType ?? "lunch",
    status: "confirmed",
    entryState: input.entryState,
    origin: input.origin ?? "homemade",
    caloriesKcal: input.caloriesKcal === undefined ? estimate(1_000) : input.caloriesKcal,
    proteinG: input.proteinG === undefined ? estimate(50) : input.proteinG,
    carbsG: input.carbsG === undefined ? estimate(130) : input.carbsG,
    fatG: input.fatG === undefined ? estimate(30) : input.fatG,
    fiberG: input.fiberG === undefined ? estimate(25) : input.fiberG,
    sugarG: input.sugarG,
    addedSugarG: input.addedSugarG === undefined ? estimate(0) : input.addedSugarG,
    foods: input.foods,
    analysisConfidence: input.analysisConfidence ?? "high",
    mouthHeat: null,
    stomachOverfullness: null,
  };
}

function dayFrom(records: readonly ConfirmedMealRecord[]) {
  return aggregateConfirmedMeals(records)[0] ?? null;
}

function component(result: ReturnType<typeof calculateMealBalanceScore>, key: keyof typeof MEAL_BALANCE_COMPONENT_WEIGHTS) {
  return result.components.find((item) => item.key === key)!;
}

function scoreForSugar(sugar: number) {
  const records = [meal({ id: `sugar-${sugar}`, addedSugarG: estimate(sugar) })];
  return calculateMealBalanceScore({ day: dayFrom(records), records, targets });
}

describe("meal-balance-v3", () => {
  it("expose les cinq dimensions et garde le score indisponible sans observation", () => {
    const result = calculateMealBalanceScore({ day: null, targets });

    expect(result.algorithmVersion).toBe(MEAL_BALANCE_ALGORITHM_VERSION);
    expect(result.score).toBeNull();
    expect(result.status).toBe("insufficient");
    expect(result.components.map((item) => item.key)).toEqual([...MEAL_BALANCE_COMPONENT_ORDER]);
    expect(result.components.every((item) => item.score === null && item.contribution === 0)).toBe(true);
  });

  it("normalise les priorités 25/25/25/25/10 sans changer le neutre", () => {
    expect(MEAL_BALANCE_WEIGHT_TOTAL).toBe(110);
    expect(MEAL_BALANCE_NORMALIZED_COMPONENT_WEIGHTS.nutritionAdequacy).toBeCloseTo(25 / 110 * 100);
    expect(MEAL_BALANCE_NORMALIZED_COMPONENT_WEIGHTS.positiveVariety).toBeCloseTo(10 / 110 * 100);
    expect(MEAL_BALANCE_NEUTRAL_BASE).toBe(50);
  });

  it("distingue une valeur nutritionnelle nulle d'une valeur absente", () => {
    const missing = [meal({ id: "missing", caloriesKcal: null, proteinG: null, carbsG: null, fatG: null, fiberG: null })];
    const explicitZero = [meal({ id: "zero", caloriesKcal: estimate(0), proteinG: estimate(50), carbsG: estimate(130), fatG: estimate(30), fiberG: estimate(25) })];
    const missingResult = calculateMealBalanceScore({ day: dayFrom(missing), records: missing, targets });
    const zeroResult = calculateMealBalanceScore({ day: dayFrom(explicitZero), records: explicitZero, targets });

    expect(component(missingResult, "nutritionAdequacy").score).toBeNull();
    expect(component(zeroResult, "nutritionAdequacy").score).not.toBeNull();
    expect(component(zeroResult, "nutritionAdequacy").subcomponents.find((item) => item.key === "calories")?.score).toBe(0);
  });

  it("rend l'adéquation indisponible si un repas principal n'est pas déclaré, sans bloquer les autres dimensions", () => {
    const records = [meal({ id: "lunch", mealType: "lunch", foods: [food("lentilles", { foodGroups: ["legume"], novaGroup: 1, qualityProperties: ["fiber_source"] })] })];
    const result = calculateMealBalanceScore({
      day: dayFrom(records),
      records,
      targets,
      slotStates: { breakfast: "recorded", lunch: "recorded", dinner: "not_recorded" },
    });

    expect(component(result, "nutritionAdequacy").score).toBeNull();
    expect(component(result, "foodQuality").score).not.toBeNull();
    expect(component(result, "nova").score).not.toBeNull();
    expect(result.score).toEqual(expect.any(Number));
  });

  it("ne rend pas la collation obligatoire", () => {
    const records = [meal({ id: "breakfast", mealType: "breakfast" }), meal({ id: "lunch", mealType: "lunch" }), meal({ id: "dinner", mealType: "dinner" })];
    const result = calculateMealBalanceScore({
      day: dayFrom(records),
      records,
      targets,
      slotStates: { breakfast: "recorded", lunch: "recorded", dinner: "recorded" },
    });

    expect(component(result, "nutritionAdequacy").score).not.toBeNull();
  });

  it("calcule la qualité par rôles favorables, en ignorant les anciennes propriétés", () => {
    const positive = [meal({ id: "positive", foods: [food("repas complet", {
      foodGroups: ["vegetable", "animal_protein", "nuts_seeds"],
      qualityProperties: ["fiber_source", "protein_source", "unsaturated_fat_source"],
    })] })];
    const legacyOnly = [meal({ id: "legacy", foods: [food("barre", {
      foodGroups: ["other"],
      qualityProperties: ["whole_food", "minimally_processed", "fermented"],
    })] })];
    const positiveResult = calculateMealBalanceScore({ day: dayFrom(positive), records: positive, targets });
    const legacyResult = calculateMealBalanceScore({ day: dayFrom(legacyOnly), records: legacyOnly, targets });
    const quality = component(positiveResult, "foodQuality");

    expect(quality.subcomponents.map((item) => [item.key, item.weight])).toEqual([
      ["plant", 40],
      ["protein", 30],
      ["fiber", 20],
      ["unsaturatedFat", 10],
    ]);
    expect(quality.score).toBeGreaterThan(50);
    expect(component(legacyResult, "foodQuality").rawScore).toBe(50);
    expect(component(legacyResult, "foodQuality").contribution).toBe(0);
  });

  it("ne donne pas de bonus de qualité à une barre sans rôle favorable", () => {
    const records = [meal({ id: "bar", foods: [food("barre de céréales", { foodGroups: ["other"], qualityProperties: [] })] })];
    const result = calculateMealBalanceScore({ day: dayFrom(records), records, targets });

    expect(component(result, "foodQuality").score).toBe(50);
    expect(component(result, "foodQuality").contribution).toBe(0);
  });

  it("pénalise progressivement le sucre puis ajoute une surcharge sévère après 20 g", () => {
    expect(scoreSugarLoadForMealBalance(0)).toBe(100);
    expect(scoreSugarLoadForMealBalance(20)).toBe(0);
    expect(scoreSugarLoadForMealBalance(40)).toBe(0);

    const atZero = scoreForSugar(0);
    const atTwenty = scoreForSugar(20);
    const atForty = scoreForSugar(40);

    expect(component(atTwenty, "sugarLoad").contribution).toBeLessThanOrEqual(-10);
    expect(component(atForty, "sugarLoad").severityPenalty).toBe(15);
    expect(component(atForty, "sugarLoad").severityPenalty).toBeLessThanOrEqual(MEAL_BALANCE_SUGAR_SEVERE_CAP);
    expect(atZero.score! - atTwenty.score!).toBeGreaterThanOrEqual(10);
    expect(atTwenty.score! - atForty.score!).toBeGreaterThanOrEqual(10);
  });

  it("compte le sucre total d'un jus concentré, mais pas le sucre naturel d'un fruit entier", () => {
    const juice = [meal({ id: "juice", foods: [food("jus d'orange", {
      foodGroups: ["beverage"],
      novaGroup: 4,
      sugarExposure: { concentrated: true, liquid: true },
      sugarG: estimate(60),
      addedSugarG: estimate(0),
    })] })];
    const fruit = [meal({ id: "fruit", foods: [food("orange entière", {
      foodGroups: ["fruit"],
      novaGroup: 1,
      sugarExposure: { concentrated: false, liquid: false },
      sugarG: estimate(60),
      addedSugarG: estimate(0),
    })] })];
    const juiceResult = calculateMealBalanceScore({ day: dayFrom(juice), records: juice, targets });
    const fruitResult = calculateMealBalanceScore({ day: dayFrom(fruit), records: fruit, targets });

    expect(component(juiceResult, "sugarLoad").observedValue).toContain("60");
    expect(component(juiceResult, "sugarLoad").severityPenalty).toBe(25);
    expect(component(fruitResult, "sugarLoad").observedValue).toContain("0");
    expect(component(fruitResult, "sugarLoad").severityPenalty).toBe(0);
    expect(component(juiceResult, "sugarLoad").contribution).toBeLessThan(component(fruitResult, "sugarLoad").contribution);
  });

  it("conserve NOVA 1 à 4 et pondère les portions connues", () => {
    const values = ([1, 2, 3, 4] as const).map((novaGroup) => {
      const records = [meal({ id: `nova-${novaGroup}`, foods: [food(`aliment ${novaGroup}`, { novaGroup })] })];
      return component(calculateMealBalanceScore({ day: dayFrom(records), records, targets }), "nova").rawScore;
    });
    expect(values).toEqual([100, 70, 35, 5]);

    const mostlyUltra = [meal({ id: "portion", foods: [
      food("légume", { estimatedGrams: 100, novaGroup: 1 }),
      food("produit", { estimatedGrams: 900, novaGroup: 4 }),
    ] })];
    const result = calculateMealBalanceScore({ day: dayFrom(mostlyUltra), records: mostlyUltra, targets });
    expect(component(result, "nova").rawScore).toBeCloseTo(14.5);
  });

  it("exclut les bonbons de la variété positive", () => {
    const records = [meal({ id: "candy", foods: [
      food("bonbon rouge", { foodGroups: ["sweet"], novaGroup: 4 }),
      food("bonbon bleu", { foodGroups: ["sweet"], novaGroup: 4 }),
      food("bonbon vert", { foodGroups: ["sweet"], novaGroup: 4 }),
    ] })];
    const result = calculateMealBalanceScore({ day: dayFrom(records), records, historyRecords: records, targets });

    expect(component(result, "positiveVariety").score).toBeNull();
  });

  it("signale une répétition saine sans retirer de points", () => {
    const repeated = Array.from({ length: 6 }, (_, index) => meal({
      id: `courgette-${index}`,
      mealDate: `2026-09-${String(10 + index).padStart(2, "0")}`,
      foods: [food("courgette", { varietyKey: "courgette", foodGroups: ["vegetable"], novaGroup: 1 })],
    }));
    const oneDay = repeated.slice(-1);
    const repeatedResult = calculateMealBalanceScore({ day: dayFrom(oneDay), records: oneDay, historyRecords: repeated, targets });
    const oneDayResult = calculateMealBalanceScore({ day: dayFrom(oneDay), records: oneDay, historyRecords: oneDay, targets });

    expect(component(repeatedResult, "positiveVariety").summary).toContain("Répétition informative");
    expect(component(repeatedResult, "positiveVariety").rawScore).toBe(component(oneDayResult, "positiveVariety").rawScore);
  });

  it("retire un créneau pas pris de l'agrégat sans le transformer en repas à zéro", () => {
    const skipped = [meal({ id: "skipped", mealType: "snack", entryState: "skipped", caloriesKcal: estimate(0), foods: [] })];
    expect(aggregateConfirmedMeals(skipped)).toEqual([]);
    expect(calculateMealBalanceScore({ day: dayFrom(skipped), records: skipped, targets }).score).toBeNull();
  });

  it("limite l'effet de la confiance à un rapprochement de 10 % vers 50", () => {
    const high = [meal({ id: "high", analysisConfidence: "high", foods: [food("lentilles", { foodGroups: ["legume"], novaGroup: 1, qualityProperties: ["fiber_source", "protein_source"] })] })];
    const low = [meal({ id: "low", analysisConfidence: "low", foods: [food("lentilles", { foodGroups: ["legume"], novaGroup: 1, qualityProperties: ["fiber_source", "protein_source"] })] })];
    const highResult = calculateMealBalanceScore({ day: dayFrom(high), records: high, targets });
    const lowResult = calculateMealBalanceScore({ day: dayFrom(low), records: low, targets });
    const highQuality = component(highResult, "foodQuality");
    const lowQuality = component(lowResult, "foodQuality");

    expect(highQuality.rawScore).toBe(lowQuality.rawScore);
    const expectedConfidenceFactor = 1 - 0.1 + 0.1 * lowQuality.confidence;
    expect(Math.abs((lowQuality.adjustedScore ?? 50) - 50)).toBeCloseTo(Math.abs((lowQuality.rawScore ?? 50) - 50) * expectedConfidenceFactor);
    expect(Math.abs((lowResult.score ?? 50) - 50)).toBeLessThanOrEqual(Math.abs((lowResult.rawScore ?? 50) - 50));
  });

  it("ne comporte pas de mealCount dans la variété et garde les contributions dans les bornes", () => {
    const records = [meal({ id: "one", foods: [food("pomme", { foodGroups: ["fruit"], novaGroup: 1 })] })];
    const result = calculateMealBalanceScore({ day: dayFrom(records), records, targets });

    expect(component(result, "positiveVariety").subcomponents.some((item) => item.key === "mealCount")).toBe(false);
    expect(result.components.every((item) => item.contribution >= -50 && item.contribution <= 50)).toBe(true);
  });

  it("calcule séparément le sous-indicateur énergie", () => {
    expect(scoreEnergyForMealBalance({ caloriesKcal: 1_000, targets, goalMode: "maintain" })).toBe(100);
    expect(scoreEnergyForMealBalance({ caloriesKcal: 0, targets, goalMode: "maintain" })).toBe(0);
    expect(scoreEnergyForMealBalance({ caloriesKcal: 1_150, targets, goalMode: "build_muscle" })).toBe(100);
  });
});
