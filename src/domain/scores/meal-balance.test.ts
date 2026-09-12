import { describe, expect, it } from "vitest";

import { aggregateConfirmedMeals, type ConfirmedMealFood, type ConfirmedMealRecord } from "@/domain/lab/meals";
import { DEFAULT_NUTRITION_TARGETS, type NutritionTargets } from "@/domain/nutrition-targets";

import { calculateMealBalanceScore, MEAL_BALANCE_COMPONENT_WEIGHTS, MEAL_BALANCE_WEIGHT_TOTAL } from "./meal-balance";

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

  it("keeps the published weights and contribution details coherent", () => {
    expect(MEAL_BALANCE_WEIGHT_TOTAL).toBe(100);
    const records = [meal({ id: "full", foods: [food("lentilles", { foodGroups: ["legume"], novaGroup: 1 })] })];
    const result = calculateMealBalanceScore({ day: dayFrom(records), records, targets });

    expect(result.components.reduce((sum, item) => sum + item.weight, 0)).toBe(100);
    expect(result.components.every((item) => item.contribution >= 0 && item.effectiveWeight >= 0)).toBe(true);
    expect(result.components.map((item) => item.key)).toEqual(Object.keys(MEAL_BALANCE_COMPONENT_WEIGHTS));
  });
});
