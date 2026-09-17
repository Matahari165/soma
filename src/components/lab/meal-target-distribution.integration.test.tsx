import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_NUTRITION_TARGETS,
  mealTargetDistributionOf,
  parseNutritionTargets,
} from "@/domain/nutrition-targets";
import type { MealRecord, NutritionRange } from "@/domain/meal-record";
import { LabMealCard } from "./meal-card-variants";

const noValue: NutritionRange = { low: null, likely: null, high: null };

function makeMeal(overrides: Partial<MealRecord> = {}): MealRecord {
  return {
    id: "meal-target-distribution",
    date: "2026-09-16",
    slot: "lunch",
    note: "Rice and vegetables",
    photos: [],
    analysis: {
      dishType: "Rice and vegetables",
      ingredients: [],
      calories: { low: 1_100, likely: 1_200, high: 1_300 },
      proteinGrams: { low: 60, likely: 64, high: 68 },
      carbohydratesGrams: { low: 140, likely: 154, high: 168 },
      fatGrams: { low: 28, likely: 32, high: 36 },
      addedSugarGrams: { low: 1, likely: 2, high: 3 },
    },
    mouthHeat: null,
    stomachLoad: null,
    status: "confirmed",
    ...overrides,
  };
}

function renderMeal(meal: MealRecord, targets = DEFAULT_NUTRITION_TARGETS): string {
  return renderToStaticMarkup(
    <LabMealCard
      meal={meal}
      slot={meal.slot}
      targets={targets}
      saving={false}
      processingFiles={false}
      mutationBusy={false}
      onFiles={() => undefined}
      onRemovePhoto={() => undefined}
      onAnalyze={() => undefined}
      onCancelAnalysis={() => undefined}
      onNote={() => undefined}
      onEdit={() => undefined}
    />,
  );
}

describe("meal target distribution integration", () => {
  it("requires an exact 100% split while allowing an optional 0% snack", () => {
    const valid = {
      ...DEFAULT_NUTRITION_TARGETS,
      mealDistribution: { breakfast: 25, lunch: 40, snack: 0, dinner: 35 },
    };

    expect(mealTargetDistributionOf(valid)).toEqual(valid.mealDistribution);
    expect(parseNutritionTargets(valid)?.mealDistribution).toEqual(valid.mealDistribution);
    expect(parseNutritionTargets({
      ...valid,
      mealDistribution: { breakfast: 25, lunch: 39, snack: 0, dinner: 35 },
    })).toBeNull();
    expect(parseNutritionTargets({
      ...valid,
      mealDistribution: { breakfast: 25, lunch: 40, snack: 1, dinner: 35 },
    })).toBeNull();
  });

  it("shows a separate target for all five metrics of a lunch", () => {
    const html = renderMeal(makeMeal());

    expect(html).toContain('aria-label="Calories: 1,200 kcal, target 1,200 kcal"');
    expect(html).toContain('aria-label="Protein: 64 g, target 64 g"');
    expect(html).toContain('aria-label="Carbohydrates: 154 g, target 154 g"');
    expect(html).toContain('aria-label="Fat: 32 g, target 32 g"');
    expect(html).toContain('aria-label="Added sugar: 2 g, target 2 g"');
  });

  it("keeps an optional snack target and unavailable values as em dashes", () => {
    const snackTargets = {
      ...DEFAULT_NUTRITION_TARGETS,
      mealDistribution: { breakfast: 25, lunch: 40, snack: 0, dinner: 35 },
    };
    const html = renderMeal(makeMeal({
      slot: "snack",
      analysis: {
        dishType: "Snack",
        ingredients: [],
        calories: noValue,
        proteinGrams: noValue,
        carbohydratesGrams: noValue,
        fatGrams: noValue,
        addedSugarGrams: noValue,
      },
    }), snackTargets);

    expect(html).toContain('aria-label="Calories: —"');
    expect(html).toContain('aria-label="Protein: —"');
    expect(html).toContain('aria-label="Carbohydrates: —"');
    expect(html).toContain('aria-label="Fat: —"');
    expect(html).toContain('aria-label="Added sugar: —"');
    expect(html.match(/Target —/g)).toHaveLength(5);
    expect(html).not.toContain("Target 0");
  });
});
