import { describe, expect, it } from "vitest";

import { aggregateConfirmedMeals, type ConfirmedMealFood, type ConfirmedMealRecord } from "@/domain/lab/meals";
import { DEFAULT_NUTRITION_TARGETS, type NutritionTargets } from "@/domain/nutrition-targets";

import {
  calculateMealBalanceScore,
  MEAL_BALANCE_ALGORITHM_VERSION,
  MEAL_BALANCE_ADVERSE_PENALTY_CAP,
  MEAL_BALANCE_COMPONENT_WEIGHTS,
  MEAL_BALANCE_NEUTRAL_BASE,
  MEAL_BALANCE_WEIGHT_TOTAL,
  scoreEnergyForMealBalance,
} from "./meal-balance";

const targets: NutritionTargets = {
  ...DEFAULT_NUTRITION_TARGETS,
  caloriesKcal: { low: 2_900, likely: 3_000, high: 3_100 },
  surplusKcal: 300,
};

function estimate(likely: number) {
  return { low: likely, likely, high: likely };
}

function meal(input: Partial<ConfirmedMealRecord> & Pick<ConfirmedMealRecord, "id">): ConfirmedMealRecord {
  return {
    id: input.id,
    mealDate: "2026-09-12",
    mealType: input.mealType ?? "lunch",
    status: "confirmed",
    origin: input.origin ?? "homemade",
    caloriesKcal: input.caloriesKcal === undefined ? estimate(3_000) : input.caloriesKcal,
    proteinG: input.proteinG === undefined ? estimate(160) : input.proteinG,
    carbsG: input.carbsG === undefined ? estimate(385) : input.carbsG,
    fatG: input.fatG === undefined ? estimate(80) : input.fatG,
    fiberG: input.fiberG === undefined ? estimate(30) : input.fiberG,
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

function food(name: string, overrides: Partial<ConfirmedMealFood> = {}): ConfirmedMealFood {
  return { name, varietyKey: name.toLocaleLowerCase("fr-FR"), ...overrides };
}

const mealSlots = ["breakfast", "lunch", "snack", "dinner"] as const;
const noSugarExposure = { liquid: false, concentrated: false } as const;

function completeMeal(id: string, mealType: (typeof mealSlots)[number], foods: readonly ConfirmedMealFood[], caloriesKcal = 750) {
  return meal({
    id,
    mealType,
    caloriesKcal: estimate(caloriesKcal),
    proteinG: estimate(40),
    carbsG: estimate(95),
    fatG: estimate(20),
    fiberG: estimate(8),
    addedSugarG: estimate(0),
    foods,
  });
}

function excellentDay() {
  const foods = [
    [food("avoine", { foodGroups: ["whole_grain"], qualityProperties: ["whole_food", "fiber_source"], novaGroup: 1, sugarExposure: noSugarExposure }), food("pomme", { foodGroups: ["fruit"], qualityProperties: ["whole_food", "fiber_source"], novaGroup: 1, sugarExposure: noSugarExposure }), food("noix", { foodGroups: ["nuts_seeds"], qualityProperties: ["whole_food", "unsaturated_fat_source"], novaGroup: 1, sugarExposure: noSugarExposure })],
    [food("lentilles", { foodGroups: ["legume"], qualityProperties: ["whole_food", "fiber_source", "protein_source"], novaGroup: 1, sugarExposure: noSugarExposure }), food("brocoli", { foodGroups: ["vegetable"], qualityProperties: ["whole_food", "fiber_source"], novaGroup: 1, sugarExposure: noSugarExposure }), food("huile olive", { foodGroups: ["added_fat"], qualityProperties: ["unsaturated_fat_source"], novaGroup: 1, sugarExposure: noSugarExposure })],
    [food("quinoa", { foodGroups: ["whole_grain"], qualityProperties: ["whole_food", "fiber_source"], novaGroup: 1, sugarExposure: noSugarExposure }), food("saumon", { foodGroups: ["animal_protein"], qualityProperties: ["whole_food", "protein_source", "unsaturated_fat_source"], novaGroup: 1, sugarExposure: noSugarExposure }), food("carotte", { foodGroups: ["vegetable"], qualityProperties: ["whole_food", "fiber_source"], novaGroup: 1, sugarExposure: noSugarExposure })],
    [food("pois chiches", { foodGroups: ["legume"], qualityProperties: ["whole_food", "fiber_source", "protein_source"], novaGroup: 1, sugarExposure: noSugarExposure }), food("yaourt nature", { foodGroups: ["dairy"], qualityProperties: ["minimally_processed", "protein_source"], novaGroup: 2, sugarExposure: noSugarExposure }), food("poire", { foodGroups: ["fruit"], qualityProperties: ["whole_food", "fiber_source"], novaGroup: 1, sugarExposure: noSugarExposure })],
  ] as const;
  return foods.map((items, index) => completeMeal(`excellent-${index}`, mealSlots[index], items));
}

function averageDay() {
  return mealSlots.map((mealType, index) => {
    const record = completeMeal(`average-${index}`, mealType, [
      food(`cereale-${index}`, { foodGroups: ["refined_grain"], qualityProperties: [], novaGroup: 2, sugarExposure: noSugarExposure }),
      food(`proteine-${index}`, { foodGroups: ["animal_protein"], qualityProperties: ["protein_source"], novaGroup: 3, sugarExposure: noSugarExposure }),
      ...(index === 0 ? [food("dessert sucre", { foodGroups: ["sweet"], qualityProperties: [], novaGroup: 4, sugarExposure: { liquid: true, concentrated: true } })] : []),
    ]);
    return { ...record, addedSugarG: estimate(2) };
  });
}

function veryBadDay() {
  return mealSlots.map((mealType, index) => {
    const record = completeMeal(`very-bad-${index}`, mealType, [
      food(`produit-${index}`, { foodGroups: ["other"], qualityProperties: [], novaGroup: 4, sugarExposure: { liquid: true, concentrated: true } }),
      food(`sucrerie-${index}`, { foodGroups: ["sweet"], qualityProperties: [], novaGroup: 4, sugarExposure: { liquid: true, concentrated: true } }),
    ], 1_250);
    return { ...record, addedSugarG: estimate(20) };
  });
}

function badMeal(index: number) {
  return {
    ...completeMeal(`bad-${index}`, mealSlots[index], [
    food(`boisson sucree-${index}`, { foodGroups: ["sweet"], novaGroup: 4, sugarExposure: { liquid: true, concentrated: true } }),
    food(`repas-${index}`, { foodGroups: ["other"], qualityProperties: [], novaGroup: 4, sugarExposure: noSugarExposure }),
    ]),
    addedSugarG: estimate(30),
  };
}

function goodDay() {
  const foods = [
    [food("avoine bonne", { foodGroups: ["whole_grain"], qualityProperties: ["whole_food", "fiber_source"], novaGroup: 1, sugarExposure: noSugarExposure }), food("pomme bonne", { foodGroups: ["fruit"], qualityProperties: ["whole_food", "fiber_source"], novaGroup: 1, sugarExposure: noSugarExposure }), food("yaourt nature bon", { foodGroups: ["dairy"], qualityProperties: ["minimally_processed", "protein_source"], novaGroup: 2, sugarExposure: noSugarExposure })],
    [food("lentilles bonnes", { foodGroups: ["legume"], qualityProperties: ["whole_food", "fiber_source", "protein_source"], novaGroup: 1, sugarExposure: noSugarExposure }), food("riz bon", { foodGroups: ["refined_grain"], qualityProperties: ["minimally_processed"], novaGroup: 2, sugarExposure: noSugarExposure }), food("huile bonne", { foodGroups: ["added_fat"], qualityProperties: ["unsaturated_fat_source"], novaGroup: 2, sugarExposure: noSugarExposure })],
    [food("quinoa bon", { foodGroups: ["whole_grain"], qualityProperties: ["whole_food", "fiber_source"], novaGroup: 1, sugarExposure: noSugarExposure }), food("poulet bon", { foodGroups: ["animal_protein"], qualityProperties: ["protein_source", "minimally_processed"], novaGroup: 2, sugarExposure: noSugarExposure }), food("carotte bonne", { foodGroups: ["vegetable"], qualityProperties: ["whole_food", "fiber_source"], novaGroup: 1, sugarExposure: noSugarExposure })],
    [food("pois chiches bons", { foodGroups: ["legume"], qualityProperties: ["whole_food", "fiber_source", "protein_source"], novaGroup: 1, sugarExposure: noSugarExposure }), food("pain bon", { foodGroups: ["refined_grain"], qualityProperties: ["minimally_processed"], novaGroup: 2, sugarExposure: noSugarExposure }), food("poire bonne", { foodGroups: ["fruit"], qualityProperties: ["whole_food", "fiber_source"], novaGroup: 1, sugarExposure: noSugarExposure })],
  ] as const;
  return foods.map((items, index) => ({ ...completeMeal(`good-${index}`, mealSlots[index], items), addedSugarG: estimate(0) }));
}

function mediumDay() {
  return mealSlots.map((mealType, index) => ({ ...completeMeal(`medium-${index}`, mealType, [
    food(`cereale moyen-${index}`, { foodGroups: ["refined_grain"], qualityProperties: ["minimally_processed"], novaGroup: 2, sugarExposure: noSugarExposure }),
    food(`proteine moyenne-${index}`, { foodGroups: ["animal_protein"], qualityProperties: ["protein_source"], novaGroup: 3, sugarExposure: noSugarExposure }),
    food(`legume moyen-${index}`, { foodGroups: ["vegetable"], qualityProperties: ["fiber_source"], novaGroup: 2, sugarExposure: noSugarExposure }),
  ]), addedSugarG: estimate(2) }));
}

function badDay() {
  return mealSlots.map((mealType, index) => ({
    ...completeMeal(`bad-day-${index}`, mealType, [
      food(`produit sucre-${index}`, { foodGroups: ["sweet"], qualityProperties: [], novaGroup: 3, sugarExposure: noSugarExposure }),
      food(`produit sale-${index}`, { foodGroups: ["other"], qualityProperties: [], novaGroup: 3, sugarExposure: noSugarExposure }),
    ]),
    addedSugarG: estimate(8),
  }));
}

describe("calculateMealBalanceScore", () => {
  it("returns null and insufficient when there is no meal data", () => {
    const result = calculateMealBalanceScore({ day: null, targets });

    expect(result.score).toBeNull();
    expect(result.status).toBe("insufficient");
    expect(result.score).not.toBe(0);
    expect(result.coverage).toBe(0);
  });

  it("keeps a partially observed day numeric but limited", () => {
    const records = [
      meal({ id: "analysed", mealType: "breakfast", foods: [food("avoine", { foodGroups: ["whole_grain"] })] }),
      meal({ id: "not-analysed", mealType: "dinner", caloriesKcal: null, proteinG: null, carbsG: null, fatG: null, fiberG: null, addedSugarG: null, foods: undefined, analysisConfidence: undefined }),
    ];
    const result = calculateMealBalanceScore({ day: dayFrom(records), records, targets });

    expect(result.score).toEqual(expect.any(Number));
    expect(result.status).toBe("limited");
    expect(result.coverage).toBeLessThan(1);
    expect(result.components.some((item) => item.status === "limited")).toBe(true);
  });

  it("lets a whole fruit improve variety and quality without added-sugar penalty", () => {
    const base = [meal({ id: "base", foods: [food("riz", { foodGroups: ["refined_grain"], qualityProperties: [] })] })];
    const withFruit = [meal({ id: "fruit", foods: [
      food("riz", { foodGroups: ["refined_grain"] }),
      food("pomme", { foodGroups: ["fruit"], qualityProperties: ["whole_food", "fiber_source"] }),
    ] })];
    const baseResult = calculateMealBalanceScore({ day: dayFrom(base), records: base, targets });
    const fruitResult = calculateMealBalanceScore({ day: dayFrom(withFruit), records: withFruit, targets });

    expect(component(fruitResult, "variety").score).toBeGreaterThan(component(baseResult, "variety").score!);
    expect(component(fruitResult, "foodQuality").score).toBeGreaterThan(component(baseResult, "foodQuality").score!);
    expect(component(fruitResult, "addedSugar").score).toBe(component(baseResult, "addedSugar").score);
  });

  it("does not treat an unobserved quality list like an observed empty list", () => {
    const unknown = [meal({ id: "unknown", foods: [food("aliment ancien", { foodGroups: ["other"] })] })];
    const empty = [meal({ id: "empty", foods: [food("aliment observe", { qualityProperties: [] })] })];
    const unknownResult = calculateMealBalanceScore({ day: dayFrom(unknown), records: unknown, targets });
    const emptyResult = calculateMealBalanceScore({ day: dayFrom(empty), records: empty, targets });

    expect(component(unknownResult, "foodQuality").score).toBeNull();
    expect(component(unknownResult, "foodQuality").observationCoverage).toBe(0);
    expect(component(emptyResult, "foodQuality").score).not.toBeNull();
    expect(component(emptyResult, "foodQuality").observationCoverage).toBeGreaterThan(0);
  });

  it("weights food-level signals by known portions while retaining an item fallback", () => {
    const balanced = [meal({ id: "balanced", foods: [
      food("fruit", { estimatedGrams: 100, qualityProperties: ["whole_food", "fiber_source"] }),
      food("dessert", { estimatedGrams: 100, qualityProperties: [] }),
    ] })];
    const mostlyDessert = [meal({ id: "mostly-dessert", foods: [
      food("fruit", { estimatedGrams: 10, qualityProperties: ["whole_food", "fiber_source"] }),
      food("dessert", { estimatedGrams: 500, qualityProperties: [] }),
    ] })];
    const balancedResult = calculateMealBalanceScore({ day: dayFrom(balanced), records: balanced, targets });
    const mostlyDessertResult = calculateMealBalanceScore({ day: dayFrom(mostlyDessert), records: mostlyDessert, targets });

    expect(component(mostlyDessertResult, "foodQuality").score).toBeLessThan(component(balancedResult, "foodQuality").score!);
  });

  it("uses confidence specific to the observed axis", () => {
    const high = [meal({ id: "high-axis", foods: [food("lentilles", {
      qualityProperties: ["whole_food", "protein_source"],
      confidence: "low",
      observation: {
        portion: "unknown",
        novaGroup: "unknown",
        sugarExposure: "unknown",
        qualityProperties: "observed",
        confidence: { portion: "low", novaGroup: "low", sugarExposure: "low", qualityProperties: "high" },
      },
    })] })];
    const low = [meal({ id: "low-axis", foods: [food("lentilles", {
      qualityProperties: ["whole_food", "protein_source"],
      confidence: "high",
      observation: {
        portion: "unknown",
        novaGroup: "unknown",
        sugarExposure: "unknown",
        qualityProperties: "observed",
        confidence: { portion: "low", novaGroup: "low", sugarExposure: "low", qualityProperties: "low" },
      },
    })] })];
    const highResult = calculateMealBalanceScore({ day: dayFrom(high), records: high, targets });
    const lowResult = calculateMealBalanceScore({ day: dayFrom(low), records: low, targets });

    expect(component(highResult, "foodQuality").confidence).toBeGreaterThan(component(lowResult, "foodQuality").confidence);
  });

  it("accumulates added-sugar, liquid/concentrated, and NOVA penalties for a labelled soda", () => {
    const clean = [meal({ id: "clean", foods: [food("eau", { foodGroups: ["beverage"], sugarExposure: { liquid: false, concentrated: false }, novaGroup: 1 })] })];
    const soda = [meal({ id: "soda", addedSugarG: estimate(40), foods: [food("soda", {
      foodGroups: ["beverage"],
      novaGroup: 4,
      sugarExposure: { liquid: true, concentrated: true },
    })] })];
    const cleanResult = calculateMealBalanceScore({ day: dayFrom(clean), records: clean, targets });
    const sodaResult = calculateMealBalanceScore({ day: dayFrom(soda), records: soda, targets });

    expect(component(sodaResult, "addedSugar").score).toBeLessThan(component(cleanResult, "addedSugar").score!);
    expect(component(sodaResult, "sugarExposure").score).toBeLessThan(component(cleanResult, "sugarExposure").score!);
    expect(component(sodaResult, "ultraProcessing").score).toBeLessThan(component(cleanResult, "ultraProcessing").score!);
  });

  it("excludes explicitly alcoholic items from food dimensions and family counts", () => {
    const records = [meal({ id: "wine", foods: [food("vin", {
      alcoholic: true,
      foodGroups: ["beverage"],
      novaGroup: 3,
      sugarExposure: { liquid: true, concentrated: false },
    })] })];
    const day = dayFrom(records)!;
    const result = calculateMealBalanceScore({ day, records, targets });

    expect(day.foodVarietyCount).toBeNull();
    expect(day.foodGroupCounts).toBeNull();
    expect(component(result, "variety").score).toBeNull();
    expect(component(result, "sugarExposure").score).toBeNull();
    expect(component(result, "ultraProcessing").score).toBeNull();
  });

  it("does not score a partially known sugar exposure as a negative observation", () => {
    const records = [meal({ id: "partial", foods: [food("boisson", { sugarExposure: { liquid: false, concentrated: null } })] })];
    const result = calculateMealBalanceScore({ day: dayFrom(records), records, targets });
    expect(component(result, "sugarExposure").score).toBeNull();
    expect(component(result, "sugarExposure").observationCoverage).toBe(0);
  });

  it("keeps food dimensions usable when nutrition totals are unavailable", () => {
    const records = [meal({ id: "foods-only", caloriesKcal: null, proteinG: null, carbsG: null, fatG: null, fiberG: null, addedSugarG: null, foods: [food("lentilles", { qualityProperties: ["whole_food"], sugarExposure: { liquid: false, concentrated: false }, novaGroup: 1 })] })];
    const result = calculateMealBalanceScore({ day: dayFrom(records), records, targets });
    expect(component(result, "foodQuality").score).not.toBeNull();
    expect(component(result, "ultraProcessing").score).not.toBeNull();
    expect(component(result, "energy").score).toBeNull();
    expect(component(result, "nutritionCoverage").observationCoverage).toBe(0);
  });

  it("counts either a composed-dish parent or its children, never both", () => {
    const records = [meal({ id: "dish", foods: [
      food("curry", { id: "dish-1", kind: "dish" }),
      food("pois chiches", { id: "child-1", kind: "component", parentId: "dish-1" }),
    ] })];
    const result = calculateMealBalanceScore({ day: dayFrom(records), records, targets });
    expect(component(result, "variety").observedValue).toContain("1 aliment");
  });

  it("uses a non-linear energy curve and a configured build-muscle surplus plateau", () => {
    const resultFor = (caloriesKcal: number) => {
      const records = [meal({ id: String(caloriesKcal), caloriesKcal: estimate(caloriesKcal) })];
      return component(calculateMealBalanceScore({ day: dayFrom(records), records, targets, goalMode: "build_muscle" }), "energy").score!;
    };

    const veryLow = resultFor(1_000);
    const target = resultFor(3_000);
    const reasonableSurplus = resultFor(3_300);
    const excess = resultFor(6_000);
    expect(veryLow).toBeLessThan(target);
    expect(reasonableSurplus).toBe(target);
    expect(excess).toBeLessThan(reasonableSurplus);
    expect(target - veryLow).not.toBeCloseTo(excess - reasonableSurplus, 0);
  });

  it("rapproche l'énergie partielle du neutre selon la couverture, sans confondre null et zéro", () => {
    const partialRecords = [meal({ id: "energy-partial", mealType: "breakfast", caloriesKcal: estimate(750) })];
    const partialResult = calculateMealBalanceScore({ day: dayFrom(partialRecords), records: partialRecords, targets });
    const fullRecords = mealSlots.map((mealType, index) => meal({ id: `energy-full-${index}`, mealType, caloriesKcal: estimate(750) }));
    const fullResult = calculateMealBalanceScore({ day: dayFrom(fullRecords), records: fullRecords, targets });
    const completeDayScore = scoreEnergyForMealBalance({ caloriesKcal: 750, targets, goalMode: "build_muscle", partialDay: false, observationCoverage: 1 });
    const partialEnergy = component(partialResult, "energy");
    const missingRecords = [meal({ id: "energy-missing", caloriesKcal: null, proteinG: null, carbsG: null, fatG: null, fiberG: null, addedSugarG: null })];
    const missingResult = calculateMealBalanceScore({ day: dayFrom(missingRecords), records: missingRecords, targets });

    expect(partialEnergy.observationCoverage).toBeCloseTo(0.25);
    expect(partialEnergy.score).toBeGreaterThan(completeDayScore!);
    expect(partialEnergy.score).toBeLessThan(fullResult.components.find((item) => item.key === "energy")?.score ?? 100);
    expect(component(fullResult, "energy").score).toBe(100);
    expect(component(missingResult, "energy").score).toBeNull();
    expect(component(missingResult, "energy").score).not.toBe(0);
  });

  it("analyse l'alcool séparément avant le filtre des dimensions alimentaires et borne son impact", () => {
    const records = [meal({ id: "alcohol-meal", mealType: "dinner", foods: [
      food("vin", { alcoholic: true, estimatedGrams: 150, confidence: "high" }),
      food("repas accompagne", { estimatedGrams: 500, foodGroups: ["vegetable"], qualityProperties: ["whole_food"], novaGroup: 1, sugarExposure: noSugarExposure }),
    ] })];
    const result = calculateMealBalanceScore({ day: dayFrom(records), records, targets });

    expect(result.worstMeal).toMatchObject({ mealId: "alcohol-meal", type: "dinner", observationStatus: "ready" });
    expect(result.worstMeal?.signals.map((signal) => signal.key)).toContain("alcohol");
    expect(result.adversePenalty).toBeGreaterThan(0);
    expect(result.adversePenalty).toBeLessThanOrEqual(MEAL_BALANCE_ADVERSE_PENALTY_CAP);
    expect(component(result, "variety").observedValue).toContain("1 aliment");
    expect(component(result, "sugarExposure").score).toBe(100);
  });

  it("calcule une couverture spécifique au sucre ajouté, séparée de la couverture nutritionnelle", () => {
    const records = [
      meal({ id: "sugar-known", mealType: "breakfast", addedSugarG: estimate(0) }),
      meal({ id: "sugar-unknown", mealType: "lunch", addedSugarG: null }),
    ];
    const result = calculateMealBalanceScore({ day: dayFrom(records), records, targets });

    expect(component(result, "addedSugar").score).toBe(100);
    expect(component(result, "addedSugar").score).not.toBeNull();
    expect(component(result, "addedSugar").observationCoverage).toBeCloseTo(0.25);
    expect(component(result, "energy").observationCoverage).toBeCloseTo(0.5);
    expect(component(result, "nutritionCoverage").observationCoverage).toBe(0.5);
  });

  it("retains low-confidence observations while reducing their effective contribution", () => {
    const high = [meal({ id: "high", analysisConfidence: "high" })];
    const low = [meal({ id: "low", analysisConfidence: "low" })];
    const highResult = calculateMealBalanceScore({ day: dayFrom(high), records: high, targets });
    const lowResult = calculateMealBalanceScore({ day: dayFrom(low), records: low, targets });

    expect(component(lowResult, "energy").score).not.toBeNull();
    expect(component(lowResult, "energy").confidence).toBeLessThan(component(highResult, "energy").confidence);
    expect(component(lowResult, "energy").contribution).toBeLessThan(component(highResult, "energy").contribution);
    expect(lowResult.confidence).toBeLessThan(highResult.confidence);
  });

  it("keeps the published weights and neutral-base adjustments reconstructible", () => {
    expect(MEAL_BALANCE_WEIGHT_TOTAL).toBe(100);
    expect(MEAL_BALANCE_ALGORITHM_VERSION).toBe("meal-balance-v2");
    expect(MEAL_BALANCE_COMPONENT_WEIGHTS).toEqual({
      variety: 10,
      foodQuality: 20,
      addedSugar: 20,
      sugarExposure: 15,
      ultraProcessing: 20,
      nutritionCoverage: 0,
      energy: 15,
    });
    const records = [...excellentDay().slice(0, 3), badMeal(3)];
    const result = calculateMealBalanceScore({ day: dayFrom(records), records, targets });

    expect(result.components.reduce((sum, item) => sum + item.weight, 0)).toBe(100);
    expect(result.components.every((item) => item.contribution >= -item.weight / 2 && item.contribution <= item.weight / 2 && item.effectiveWeight >= 0)).toBe(true);
    expect(component(result, "nutritionCoverage").contribution).toBe(0);
    expect(result.components.map((item) => item.key)).toEqual(Object.keys(MEAL_BALANCE_COMPONENT_WEIGHTS));
    const componentAdjustment = result.components.reduce((sum, item) => sum + item.contribution, 0);
    const expectedBase = Math.round((MEAL_BALANCE_NEUTRAL_BASE + componentAdjustment) * 100) / 100;
    const expectedScore = Math.round(Math.min(100, Math.max(0, expectedBase - result.adversePenalty)) * 100) / 100;
    expect(result.baseScore).toBe(expectedBase);
    expect(result.score).toBe(expectedScore);
  });

  it("sépare clairement une excellente journée, une journée moyenne et une très mauvaise journée", () => {
    const scoreFor = (records: readonly ConfirmedMealRecord[]) => calculateMealBalanceScore({ day: dayFrom(records), records, targets }).score!;
    const excellent = scoreFor(excellentDay());
    const average = scoreFor(averageDay());
    const veryBad = scoreFor(veryBadDay());

    expect(excellent).toBeGreaterThan(average);
    expect(average).toBeGreaterThan(45);
    expect(average).toBeLessThan(85);
    expect(veryBad).toBeLessThanOrEqual(45);
    expect(excellent - veryBad).toBeGreaterThan(30);
  });

  it("calibrates a deterministic holdout with ordered bands", () => {
    const scoreFor = (records: readonly ConfirmedMealRecord[]) => calculateMealBalanceScore({ day: dayFrom(records), records, targets }).score;
    const h01 = scoreFor(excellentDay());
    const h02 = scoreFor(goodDay());
    const h03 = scoreFor(mediumDay());
    const h04 = scoreFor(badDay());
    const h05 = scoreFor(veryBadDay());
    const h06Records = [...excellentDay().slice(0, 3), badMeal(3)];
    const h06 = scoreFor(h06Records);
    const unknown = { ...meal({ id: "holdout-unknown", mealType: "breakfast", caloriesKcal: estimate(3_000), proteinG: null, carbsG: null, fatG: null, fiberG: null, addedSugarG: null, foods: undefined }), analysisConfidence: undefined };
    const h07Result = calculateMealBalanceScore({ day: dayFrom([unknown]), records: [unknown], targets });
    const h07 = h07Result.score;
    const h08 = calculateMealBalanceScore({ day: null, targets }).score;
    const h09 = component(calculateMealBalanceScore({ day: dayFrom([meal({ id: "holdout-zero", addedSugarG: estimate(0), foods: [food("aliment-zero")] })]), records: [meal({ id: "holdout-zero", addedSugarG: estimate(0), foods: [food("aliment-zero")] })], targets }), "addedSugar").score;
    const h10 = component(calculateMealBalanceScore({ day: dayFrom([meal({ id: "holdout-null", addedSugarG: null, foods: [food("aliment-null")] })]), records: [meal({ id: "holdout-null", addedSugarG: null, foods: [food("aliment-null")] })], targets }), "addedSugar").score;

    expect(h01).toBeGreaterThanOrEqual(88);
    expect(h01).toBeLessThanOrEqual(96);
    expect(h02).toBeGreaterThanOrEqual(80);
    expect(h02).toBeLessThanOrEqual(90);
    expect(h03).toBeGreaterThanOrEqual(58);
    expect(h03).toBeLessThanOrEqual(70);
    expect(h04).toBeGreaterThanOrEqual(35);
    expect(h04).toBeLessThanOrEqual(50);
    expect(h05).toBeGreaterThanOrEqual(0);
    expect(h05).toBeLessThanOrEqual(15);
    expect(h06).toBeGreaterThanOrEqual(35);
    expect(h06).toBeLessThanOrEqual(55);
    expect(scoreFor(excellentDay())! - h06!).toBeCloseTo(45.34, 0);
    expect(h07).toBeGreaterThanOrEqual(45);
    expect(h07).toBeLessThanOrEqual(55);
    expect(h07Result.coverage).toBeGreaterThan(0);
    expect(h07Result.coverage).toBeLessThan(1);
    expect(h07Result.status).toBe("limited");
    expect(h08).toBeNull();
    expect(h09).toBe(100);
    expect(h10).toBeNull();
    expect(h01!).toBeGreaterThan(h02!);
    expect(h02!).toBeGreaterThan(h03!);
    expect(h03!).toBeGreaterThan(h04!);
    expect(h04!).toBeGreaterThan(h05!);
  });

  it("fait fortement baisser le score lorsqu'un seul repas devient très mauvais", () => {
    const excellent = excellentDay();
    const baseline = calculateMealBalanceScore({ day: dayFrom(excellent), records: excellent, targets });
    const oneBad = [...excellent.slice(0, 3), badMeal(3)];
    const degraded = calculateMealBalanceScore({ day: dayFrom(oneBad), records: oneBad, targets });

    expect(baseline.score).not.toBeNull();
    expect(degraded.score).not.toBeNull();
    expect(baseline.score! - degraded.score!).toBeGreaterThanOrEqual(15);
    expect(degraded.score).toBeLessThanOrEqual(70);
    expect(degraded.reasons.some((reason) => reason.includes("Repas le plus défavorable"))).toBe(true);
  });

  it("reste monotone quand les signaux défavorables se répètent", () => {
    const excellent = excellentDay();
    const baseline = calculateMealBalanceScore({ day: dayFrom(excellent), records: excellent, targets });
    const oneBad = [...excellent.slice(0, 3), badMeal(3)];
    const twoBad = [...excellent.slice(0, 2), badMeal(2), badMeal(3)];
    const addedBad = [...excellent, badMeal(3)];
    const one = calculateMealBalanceScore({ day: dayFrom(oneBad), records: oneBad, targets });
    const two = calculateMealBalanceScore({ day: dayFrom(twoBad), records: twoBad, targets });
    const added = calculateMealBalanceScore({ day: dayFrom(addedBad), records: addedBad, targets });

    expect(added.score).toBeLessThan(baseline.score!);
    expect(two.score).toBeLessThan(one.score!);
    expect(component(two, "addedSugar").score).toBeLessThanOrEqual(component(one, "addedSugar").score!);
    expect(component(two, "ultraProcessing").score).toBeLessThanOrEqual(component(one, "ultraProcessing").score!);
  });

  it("applique des courbes sucre et NOVA monotones et sévères", () => {
    const sugarScore = (addedSugarG: number) => {
      const records = [meal({ id: `sugar-${addedSugarG}`, addedSugarG: estimate(addedSugarG), foods: [food("aliment", { foodGroups: ["whole_grain"], qualityProperties: ["whole_food"], novaGroup: 1, sugarExposure: noSugarExposure })] })];
      return component(calculateMealBalanceScore({ day: dayFrom(records), records, targets }), "addedSugar").score!;
    };
    const sugarScores = [0, 5, 10, 20, 40, 80].map(sugarScore);
    for (let index = 1; index < sugarScores.length; index += 1) {
      expect(sugarScores[index]).toBeLessThanOrEqual(sugarScores[index - 1]);
    }
    expect(sugarScores[4]).toBeLessThan(20);

    const novaScore = (novaGroup: 1 | 2 | 3 | 4) => {
      const records = [meal({ id: `nova-${novaGroup}`, foods: [food("aliment", { foodGroups: ["other"], qualityProperties: [], novaGroup, sugarExposure: noSugarExposure })] })];
      return component(calculateMealBalanceScore({ day: dayFrom(records), records, targets }), "ultraProcessing").score!;
    };
    const novaScores = ([1, 2, 3, 4] as const).map(novaScore);
    for (let index = 1; index < novaScores.length; index += 1) {
      expect(novaScores[index]).toBeLessThanOrEqual(novaScores[index - 1]);
    }
    expect(novaScores[3]).toBeLessThanOrEqual(10);
  });

  it("ne pénalise pas une forme liquide sans signal sucré", () => {
    const liquids = [meal({ id: "neutral-liquids", foods: [
      food("eau", { foodGroups: ["beverage"], novaGroup: 1, sugarExposure: { liquid: true, concentrated: false } }),
      food("lait", { foodGroups: ["dairy"], novaGroup: 1, sugarExposure: { liquid: true, concentrated: false } }),
      food("cafe", { foodGroups: ["beverage"], novaGroup: 1, sugarExposure: { liquid: true, concentrated: false } }),
      food("sauce soja", { foodGroups: ["sauce"], novaGroup: 2, sugarExposure: { liquid: true, concentrated: false } }),
    ] })];
    const sweetLiquid = [meal({ id: "sweet-liquid", foods: [food("boisson sucree", {
      foodGroups: ["sweet"],
      novaGroup: 4,
      sugarExposure: { liquid: true, concentrated: false },
    })] })];
    const liquidResult = calculateMealBalanceScore({ day: dayFrom(liquids), records: liquids, targets });
    const sweetResult = calculateMealBalanceScore({ day: dayFrom(sweetLiquid), records: sweetLiquid, targets });

    expect(component(liquidResult, "sugarExposure").score).toBe(100);
    expect(component(sweetResult, "sugarExposure").score).toBeLessThan(component(liquidResult, "sugarExposure").score!);
  });

  it("garde les inconnues neutres, distingue null de zéro et baisse avec un repas absent", () => {
    const full = excellentDay();
    const fullResult = calculateMealBalanceScore({ day: dayFrom(full), records: full, targets });
    const unknown = {
      ...meal({ id: "unknown-only", mealType: "breakfast", caloriesKcal: estimate(3_000), proteinG: null, carbsG: null, fatG: null, fiberG: null, addedSugarG: null, foods: undefined }),
      analysisConfidence: undefined,
    };
    const unknownResult = calculateMealBalanceScore({ day: dayFrom([unknown]), records: [unknown], targets });
    const withUnknown = [...full, unknown];
    const withUnknownResult = calculateMealBalanceScore({ day: dayFrom(withUnknown), records: withUnknown, targets });
    const absent = full.slice(0, 3);
    const absentResult = calculateMealBalanceScore({ day: dayFrom(absent), records: absent, targets });
    const zero = [meal({ id: "zero", addedSugarG: estimate(0), foods: [food("zero-food")] })];
    const missing = [{ ...zero[0], id: "missing", addedSugarG: null }];

    expect(unknownResult.score).not.toBeNull();
    expect(unknownResult.score).toBeGreaterThanOrEqual(45);
    expect(unknownResult.score).toBeLessThanOrEqual(55);
    expect(withUnknownResult.score).toBeLessThanOrEqual(fullResult.score!);
    expect(absentResult.coverage).toBeLessThan(fullResult.coverage);
    expect(component(calculateMealBalanceScore({ day: dayFrom(zero), records: zero, targets }), "addedSugar").score).toBe(100);
    expect(component(calculateMealBalanceScore({ day: dayFrom(missing), records: missing, targets }), "addedSugar").score).toBeNull();
  });

  it("ne déduit pas de pénalité adverse quand aucun comportement n'est observé", () => {
    const alcoholOnly = [meal({
      id: "alcohol-only",
      caloriesKcal: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
      fiberG: null,
      addedSugarG: null,
      foods: [food("vin uniquement", { alcoholic: true, confidence: "high" })],
    })];
    const unknownOnly = [meal({
      id: "unknown-only-no-behaviour",
      caloriesKcal: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
      fiberG: null,
      addedSugarG: null,
      foods: undefined,
    })];

    for (const records of [alcoholOnly, unknownOnly]) {
      const result = calculateMealBalanceScore({ day: dayFrom(records), records, targets });
      expect(result.score).toBeNull();
      expect(result.baseScore).toBeNull();
      expect(result.adversePenalty).toBe(0);
      expect(result.worstMeal).toBeNull();
    }
  });

  it("pondère la pénalité adverse par confiance sans transformer un mauvais signal en bonus", () => {
    const highRecords = veryBadDay();
    const lowRecords = highRecords.map((record) => ({
      ...record,
      analysisConfidence: "low" as const,
      foods: record.foods?.map((item) => ({
        ...item,
        confidence: "low" as const,
        observation: {
          portion: "observed" as const,
          novaGroup: "observed" as const,
          sugarExposure: "observed" as const,
          qualityProperties: "observed" as const,
          confidence: { portion: "low" as const, novaGroup: "low" as const, sugarExposure: "low" as const, qualityProperties: "low" as const },
        },
      })),
    }));
    const high = calculateMealBalanceScore({ day: dayFrom(highRecords), records: highRecords, targets });
    const low = calculateMealBalanceScore({ day: dayFrom(lowRecords), records: lowRecords, targets });

    expect(low.confidence).toBeLessThan(high.confidence);
    expect(low.adversePenalty).toBeGreaterThan(0);
    expect(low.adversePenalty).toBeLessThan(high.adversePenalty);
    expect(low.worstMeal?.penalty).toBeLessThan(high.worstMeal?.penalty ?? 0);
    expect(low.worstMeal?.observationStatus).toBe("limited");
    expect(low.worstMeal?.signals.every((signal) => signal.weightedRisk >= 0)).toBe(true);
    for (const result of [high, low]) {
      expect(result.adversePenalty).toBeGreaterThanOrEqual(0);
      expect(result.adversePenalty).toBeLessThanOrEqual(MEAL_BALANCE_ADVERSE_PENALTY_CAP);
      if (result.worstMeal) expect(result.worstMeal.penalty).toBeLessThanOrEqual(MEAL_BALANCE_ADVERSE_PENALTY_CAP);
      for (const value of [result.score, result.baseScore, result.coverage, result.confidence, ...result.components.flatMap((item) => [item.score, item.weight, item.effectiveWeight, item.observationCoverage, item.confidence])]) {
        if (value === null) continue;
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
      for (const componentItem of result.components) {
        expect(Number.isFinite(componentItem.contribution)).toBe(true);
        expect(componentItem.contribution).toBeGreaterThanOrEqual(-componentItem.weight / 2);
        expect(componentItem.contribution).toBeLessThanOrEqual(componentItem.weight / 2);
      }
    }
  });

  it("est stable sous permutation et déduplication des lignes", () => {
    const records = excellentDay();
    const result = calculateMealBalanceScore({ day: dayFrom(records), records, targets });
    const reversed = [...records].reverse();
    const reversedResult = calculateMealBalanceScore({ day: dayFrom(reversed), records: reversed, targets });
    const duplicated = [...records, { ...records[0], photoIds: ["photo-a", "photo-b"] }];
    const duplicatedResult = calculateMealBalanceScore({ day: dayFrom(duplicated), records: duplicated, targets });

    expect(reversedResult.score).toBe(result.score);
    expect(reversedResult.coverage).toBe(result.coverage);
    expect(duplicatedResult.score).toBe(result.score);
    expect(duplicatedResult.coverage).toBe(result.coverage);
  });
});
