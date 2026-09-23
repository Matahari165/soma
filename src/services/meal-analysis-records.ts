import type { ConfirmedMealRecord, NutritionEstimate } from "@/domain/lab/meals";
import type { Meal, MealAnalysis } from "@/domain/meals";

type ConfirmedMealFoodWithSugar = NonNullable<ConfirmedMealRecord["foods"]>[number] & {
  sugarG?: NutritionEstimate | null;
  addedSugarG?: NutritionEstimate | null;
};

function nutritionEstimate(value: { low: number; likely: number; high: number } | null | undefined): NutritionEstimate | null {
  if (!value || !Number.isFinite(value.low) || !Number.isFinite(value.likely) || !Number.isFinite(value.high) || value.low < 0 || value.low > value.likely || value.likely > value.high) return null;
  return { low: value.low, likely: value.likely, high: value.high };
}

function confirmedMealFood(food: MealAnalysis["foods"][number]): ConfirmedMealFoodWithSugar {
  return {
    id: food.id,
    name: food.name,
    kind: food.kind,
    parentId: food.parentId,
    portion: food.portion ?? null,
    estimatedGrams: food.estimatedGrams ?? null,
    quantity: food.quantity ?? null,
    sugarG: nutritionEstimate(food.sugarGrams),
    addedSugarG: nutritionEstimate(food.addedSugarGrams),
    varietyKey: food.varietyKey ?? null,
    foodGroups: food.foodGroups,
    alcoholic: food.alcoholic,
    novaGroup: food.novaGroup,
    sugarExposure: food.sugarExposure,
    qualityProperties: food.qualityProperties,
    observation: food.observation,
    countedInTotals: food.countedInTotals,
    confidence: food.confidence,
  };
}

function mealOrigin(meal: Meal): ConfirmedMealRecord["origin"] {
  const origins = new Set(meal.photos.map((photo) => photo.origin));
  return origins.size === 0 ? "unknown" : origins.size === 1 ? [...origins][0] : "mixed";
}

/**
 * Build the canonical Personal Lab observation for one confirmed meal.
 * Missing analysis remains null throughout; explicit zero estimates stay zero.
 */
export function confirmedMealRecordFor(meal: Meal): ConfirmedMealRecord | null {
  if (meal.status !== "confirmed") return null;
  const analysis = meal.analysis?.status === "completed" && meal.analysis.result
    ? meal.analysis
    : meal.lastSuccessfulAnalysis?.status === "completed" && meal.lastSuccessfulAnalysis.result
      ? meal.lastSuccessfulAnalysis
      : null;
  const result = analysis?.result ?? null;
  const totals = result?.totals;
  return {
    id: meal.id,
    mealDate: meal.mealDate,
    mealType: meal.mealType,
    status: "confirmed" as const,
    entryState: meal.entryState,
    origin: mealOrigin(meal),
    caloriesKcal: nutritionEstimate(totals?.calories),
    proteinG: nutritionEstimate(totals?.proteinGrams),
    carbsG: nutritionEstimate(totals?.carbohydrateGrams),
    fatG: nutritionEstimate(totals?.fatGrams),
    fiberG: nutritionEstimate(totals?.fiberGrams),
    sugarG: nutritionEstimate(totals?.sugarGrams),
    addedSugarG: nutritionEstimate(totals?.addedSugarGrams),
    foods: result?.foods.map(confirmedMealFood),
    analysisConfidence: result?.confidence,
    mouthHeat: meal.mouthWarmthIntensity,
    stomachOverfullness: meal.stomachOverfullIntensity,
    photoIds: meal.photos.map((photo) => photo.id),
  } satisfies ConfirmedMealRecord;
}
