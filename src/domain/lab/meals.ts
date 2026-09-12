import type { MatrixPoint, MatrixSeries } from "@/domain/lab/matrix";
import type { MealFoodGroup, MealFoodKind, MealFoodObservation, MealNovaGroup, MealQualityProperty, MealQuantity, MealSugarExposure } from "@/domain/meals";

/** Meal slots supported by the first meal journal version. */
export const mealTypes = ["breakfast", "lunch", "snack", "dinner"] as const;
export type MealType = (typeof mealTypes)[number];

/** Origin selected for the meal. A restaurant or delivery meal is prepared. */
export const mealOrigins = ["homemade", "prepared", "mixed"] as const;
export type MealOrigin = (typeof mealOrigins)[number];
export type ConfirmedMealOrigin = MealOrigin | "unknown";

/** A bounded AI estimate. The `likely` value is the value used in Personal Lab. */
export type NutritionEstimate = {
  low: number;
  likely: number;
  high: number;
};

/**
 * Canonical input for the Personal Lab meal adapter.
 *
 * The backend should return only confirmed records. Keeping the status in the
 * contract makes accidental inclusion of drafts explicit and lets this pure
 * adapter remain safe when fed a mixed query result in tests.
 */
export type ConfirmedMealRecord = {
  id: string;
  mealDate: string;
  mealType: MealType;
  status: "confirmed";
  origin: ConfirmedMealOrigin;
  caloriesKcal: NutritionEstimate | null;
  proteinG: NutritionEstimate | null;
  carbsG: NutritionEstimate | null;
  fatG: NutritionEstimate | null;
  fiberG: NutritionEstimate | null;
  sugarG?: NutritionEstimate | null;
  addedSugarG?: NutritionEstimate | null;
  foods?: readonly ConfirmedMealFood[];
  analysisConfidence?: "low" | "medium" | "high";
  /** 0 means explicitly no sensation; null means not answered. */
  mouthHeat: number | null;
  /** 0 means explicitly no sensation; null means not answered. */
  stomachOverfullness: number | null;
  /** Kept for provenance; photos must not create additional meal records. */
  photoIds?: readonly string[];
};

export type ConfirmedMealFood = {
  id?: string;
  name: string;
  kind?: MealFoodKind;
  parentId?: string | null;
  /** Preserved when the analysis provides a usable portion description. */
  portion?: string | null;
  /** Legacy-compatible numeric portion; null remains different from zero. */
  estimatedGrams?: number | null;
  /** Structured portion evidence from newer analyses. */
  quantity?: MealQuantity | null;
  /** Per-axis observation status from newer analyses. */
  observation?: MealFoodObservation;
  varietyKey?: string | null;
  foodGroups?: readonly MealFoodGroup[];
  alcoholic?: boolean;
  novaGroup?: MealNovaGroup | null;
  sugarExposure?: MealSugarExposure | null;
  qualityProperties?: readonly MealQualityProperty[];
  countedInTotals?: boolean;
  confidence?: "low" | "medium" | "high";
};

export type MealFoodObservationCoverage = {
  qualityProperties: number;
  sugarExposure: number;
  novaGroup: number;
  portion: number;
};

export type MealDailyAggregate = {
  date: string;
  mealCount: number;
  mealCoverage: number;
  homemadeCount: number;
  preparedCount: number;
  mixedCount: number;
  homemadeShare: number;
  caloriesKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  addedSugarG: number | null;
  analysisCoverage: number | null;
  analysisConfidence: number | null;
  foodVarietyCount: number | null;
  foodGroupCount: number | null;
  /** Share of confirmed meals whose analysis contains a food list. */
  foodListCoverage?: number | null;
  /** Cross-labelled family occurrences; null means no food classification. */
  foodGroupCounts: Partial<Record<MealFoodGroup, number>> | null;
  /** null means no food list; zero values mean an explicit empty/unlabelled list. */
  foodObservationCoverage?: MealFoodObservationCoverage | null;
  mouthHeatAverage: number | null;
  mouthHeatMaximum: number | null;
  stomachOverfullnessAverage: number | null;
  stomachOverfullnessMaximum: number | null;
};

export type MealNutritionTrendMetricId = "caloriesKcal" | "proteinG" | "addedSugarG" | "fatG" | "carbsG";

export type MealNutritionTrendPoint = {
  date: string;
  value: number | null;
};

export type MealNutritionTrendMetric = {
  id: MealNutritionTrendMetricId;
  points: MealNutritionTrendPoint[];
};

export type MealMetricId =
  | "meal_calories"
  | "meal_protein"
  | "meal_carbs"
  | "meal_fat"
  | "meal_fiber"
  | "meal_sugar"
  | "meal_added_sugar"
  | "meal_count"
  | "meal_coverage"
  | "meal_homemade_count"
  | "meal_prepared_count"
  | "meal_mixed_count"
  | "meal_homemade_share"
  | "meal_mouth_heat_average"
  | "meal_mouth_heat_maximum"
  | "meal_stomach_overfullness_average"
  | "meal_stomach_overfullness_maximum"
  | "meal_analysis_coverage"
  | "meal_analysis_confidence"
  | "meal_food_variety"
  | "meal_food_groups";

export const mealMetricIds: readonly MealMetricId[] = [
  "meal_calories",
  "meal_protein",
  "meal_carbs",
  "meal_fat",
  "meal_fiber",
  "meal_sugar",
  "meal_added_sugar",
  "meal_count",
  "meal_coverage",
  "meal_homemade_count",
  "meal_prepared_count",
  "meal_mixed_count",
  "meal_homemade_share",
  "meal_mouth_heat_average",
  "meal_mouth_heat_maximum",
  "meal_stomach_overfullness_average",
  "meal_stomach_overfullness_maximum",
  "meal_analysis_coverage",
  "meal_analysis_confidence",
  "meal_food_variety",
  "meal_food_groups",
];

export function isMealMetric(id: string): id is MealMetricId {
  return (mealMetricIds as readonly string[]).includes(id);
}

function finiteNonNegative(value: unknown) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function likelyEstimate(value: NutritionEstimate | null | undefined) {
  if (!value || typeof value !== "object") return null;
  return finiteNonNegative(value.likely);
}

function intensity(value: unknown) {
  // Zero is deliberately retained: it is an explicit "none" answer, unlike
  // null, which means the user did not provide a rating.
  const number = finiteNonNegative(value);
  return number !== null && number <= 5 ? number : null;
}

function average(values: Array<number | null>) {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

function maximum(values: Array<number | null>) {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? Math.max(...present) : null;
}

// Sugar fields were added later and remain optional on historical analyses;
// coverage therefore measures the five core nutrition fields only.
const nutritionFields = ["caloriesKcal", "proteinG", "carbsG", "fatG", "fiberG"] as const;

function confidenceValue(value: ConfirmedMealRecord["analysisConfidence"]) {
  return value === "high" ? 100 : value === "medium" ? 67 : value === "low" ? 33 : null;
}

function canonicalFoodKey(food: ConfirmedMealFood) {
  const raw = food.varietyKey?.trim() || food.name.trim();
  return raw ? raw.toLocaleLowerCase("fr-FR") : null;
}

/** Sum known estimates; unknown meals do not erase the known part of the day. */
function sumNutrition(records: readonly ConfirmedMealRecord[], read: (record: ConfirmedMealRecord) => NutritionEstimate | null) {
  if (!records.length) return null;
  const values = records.map((record) => likelyEstimate(read(record)));
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

/**
 * Convert confirmed meal records to one daily observation per calendar day.
 *
 * Meal IDs are the unit of observation: repeated rows for the same meal (for
 * example one row per photo, or an old and a replacement analysis) are
 * collapsed, with the last confirmed analysis winning. This keeps multi-photo
 * capture from inflating meal counts, coverage, or nutrition totals.
 */
export function aggregateConfirmedMeals(records: readonly ConfirmedMealRecord[]): MealDailyAggregate[] {
  const byId = new Map<string, ConfirmedMealRecord>();
  for (const record of records) {
    if (!record || typeof record.id !== "string" || !record.id || record.status !== "confirmed") continue;
    // The last confirmed version is the current analysis when a meal was
    // re-analysed after the user corrected its photos or portions.
    byId.set(record.id, record);
  }

  const byDate = new Map<string, ConfirmedMealRecord[]>();
  for (const record of byId.values()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.mealDate)) continue;
    const day = byDate.get(record.mealDate) ?? [];
    day.push(record);
    byDate.set(record.mealDate, day);
  }

  return [...byDate].sort(([first], [second]) => first.localeCompare(second)).map(([date, meals]) => {
    const homemadeCount = meals.filter((meal) => meal.origin === "homemade").length;
    const preparedCount = meals.filter((meal) => meal.origin === "prepared").length;
    const mixedCount = meals.filter((meal) => meal.origin === "mixed").length;
    const nutritionObservations = meals.flatMap((meal) => nutritionFields.map((field) => meal[field] !== null && meal[field] !== undefined));
    // A day with confirmed meals but no completed nutrition analysis is a real
    // observation with 0% coverage; an absent day has no aggregate at all.
    const analysisCoverage = nutritionObservations.length
      ? nutritionObservations.filter(Boolean).length / nutritionObservations.length * 100
      : 0;
    const confidenceValues = meals.flatMap((meal) => {
      const value = confidenceValue(meal.analysisConfidence);
      return value === null ? [] : [value];
    });
    const foods = meals.flatMap((meal) => (meal.foods ?? []).filter((food) => food.countedInTotals !== false && food.alcoholic !== true));
    const observedFoodLists = meals.filter((meal) => meal.foods !== undefined).length;
    const foodListCoverage = observedFoodLists / meals.length;
    const hasFoodListObservation = observedFoodLists > 0;
    const observedAxis = (food: ConfirmedMealFood, axis: keyof MealFoodObservation) => {
      const status = food.observation?.[axis];
      if (status === "unknown") return false;
      if (axis === "qualityProperties") return food.qualityProperties !== undefined;
      if (axis === "sugarExposure") return food.sugarExposure !== undefined && food.sugarExposure !== null
        && food.sugarExposure.liquid !== null && food.sugarExposure.concentrated !== null;
      if (axis === "novaGroup") return food.novaGroup !== undefined && food.novaGroup !== null;
      const grams = food.quantity?.grams ?? food.estimatedGrams;
      return grams !== null && grams !== undefined && Number.isFinite(grams) && grams >= 0
        ? true
        : Boolean(food.portion?.trim());
    };
    const observedPortion = (food: ConfirmedMealFood) => {
      const grams = food.quantity?.grams ?? food.estimatedGrams;
      return grams !== null && grams !== undefined && Number.isFinite(grams) && grams >= 0
        ? true
        : Boolean(food.portion?.trim());
    };
    const foodKeys = new Set(foods.flatMap((food) => {
      const key = canonicalFoodKey(food);
      return key ? [key] : [];
    }));
    const foodGroups = new Set(foods.flatMap((food) => food.foodGroups ?? []));
    const foodGroupCounts = foods.reduce<Partial<Record<MealFoodGroup, number>>>((counts, food) => {
      for (const group of food.foodGroups ?? []) counts[group] = (counts[group] ?? 0) + 1;
      return counts;
    }, {});
    return {
      date,
      mealCount: meals.length,
      mealCoverage: new Set(meals.map((meal) => meal.mealType)).size / mealTypes.length * 100,
      homemadeCount,
      preparedCount,
      mixedCount,
      // A mixed meal contributes half to the homemade share, while the raw
      // category counts remain auditable and mutually exclusive.
      homemadeShare: (homemadeCount + mixedCount * .5) / meals.length * 100,
      caloriesKcal: sumNutrition(meals, (meal) => meal.caloriesKcal),
      proteinG: sumNutrition(meals, (meal) => meal.proteinG),
      carbsG: sumNutrition(meals, (meal) => meal.carbsG),
      fatG: sumNutrition(meals, (meal) => meal.fatG),
      fiberG: sumNutrition(meals, (meal) => meal.fiberG),
      sugarG: sumNutrition(meals, (meal) => meal.sugarG ?? null),
      addedSugarG: sumNutrition(meals, (meal) => meal.addedSugarG ?? null),
      analysisCoverage,
      analysisConfidence: confidenceValues.length ? average(confidenceValues) : null,
      foodVarietyCount: foodKeys.size || null,
      foodGroupCount: foodGroups.size || null,
      foodGroupCounts: Object.keys(foodGroupCounts).length ? foodGroupCounts : null,
      foodListCoverage,
      foodObservationCoverage: hasFoodListObservation
        ? {
            qualityProperties: (foods.length ? foods.filter((food) => observedAxis(food, "qualityProperties")).length / foods.length : 0) * foodListCoverage,
            sugarExposure: (foods.length ? foods.filter((food) => observedAxis(food, "sugarExposure")).length / foods.length : 0) * foodListCoverage,
            novaGroup: (foods.length ? foods.filter((food) => observedAxis(food, "novaGroup")).length / foods.length : 0) * foodListCoverage,
            portion: (foods.length ? foods.filter((food) => observedAxis(food, "portion") && observedPortion(food)).length / foods.length : 0) * foodListCoverage,
          }
        : null,
      mouthHeatAverage: average(meals.map((meal) => intensity(meal.mouthHeat))),
      mouthHeatMaximum: maximum(meals.map((meal) => intensity(meal.mouthHeat))),
      stomachOverfullnessAverage: average(meals.map((meal) => intensity(meal.stomachOverfullness))),
      stomachOverfullnessMaximum: maximum(meals.map((meal) => intensity(meal.stomachOverfullness))),
    };
  });
}

const nutritionTrendSpecs: ReadonlyArray<{ id: MealNutritionTrendMetricId; read: (day: MealDailyAggregate) => number | null }> = [
  { id: "caloriesKcal", read: (day) => day.caloriesKcal },
  { id: "proteinG", read: (day) => day.proteinG },
  { id: "addedSugarG", read: (day) => day.addedSugarG },
  { id: "fatG", read: (day) => day.fatG },
  { id: "carbsG", read: (day) => day.carbsG },
];

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * Build calendar-aligned daily nutrition points for the meal history UI.
 * Missing calendar days and incomplete nutrition estimates remain null: they
 * are not observations and must not be rendered as zero.
 */
export function mealNutritionHistory(records: readonly ConfirmedMealRecord[], endDate: string, days = 30): MealNutritionTrendMetric[] {
  const safeDays = Math.max(1, Math.floor(days));
  const byDate = new Map(aggregateConfirmedMeals(records).map((day) => [day.date, day]));
  const dates = Array.from({ length: safeDays }, (_, index) => addDays(endDate, index - (safeDays - 1)));
  return nutritionTrendSpecs.map((spec) => ({
    id: spec.id,
    points: dates.map((date) => {
      const day = byDate.get(date);
      return { date, value: day ? spec.read(day) : null };
    }),
  }));
}

export type MealFoodGroupTrendPoint = {
  date: string;
  counts: Partial<Record<MealFoodGroup, number>> | null;
};

/** Calendar-aligned family distribution for the Repas page. */
export function mealFoodGroupHistory(records: readonly ConfirmedMealRecord[], endDate: string, days = 28): MealFoodGroupTrendPoint[] {
  const safeDays = Math.max(1, Math.floor(days));
  const byDate = new Map(aggregateConfirmedMeals(records).map((day) => [day.date, day]));
  return Array.from({ length: safeDays }, (_, index) => {
    const date = addDays(endDate, index - (safeDays - 1));
    return { date, counts: byDate.get(date)?.foodGroupCounts ?? null };
  });
}

const seriesSpec: ReadonlyArray<{ id: MealMetricId; label: string; unit: string; read: (day: MealDailyAggregate) => number | null }> = [
  { id: "meal_calories", label: "Meal calories", unit: "kcal", read: (day) => day.caloriesKcal },
  { id: "meal_protein", label: "Meal protein", unit: "g", read: (day) => day.proteinG },
  { id: "meal_carbs", label: "Meal carbohydrates", unit: "g", read: (day) => day.carbsG },
  { id: "meal_fat", label: "Meal fat", unit: "g", read: (day) => day.fatG },
  { id: "meal_fiber", label: "Meal fiber", unit: "g", read: (day) => day.fiberG },
  { id: "meal_sugar", label: "Meal sugars", unit: "g", read: (day) => day.sugarG },
  { id: "meal_added_sugar", label: "Meal added sugars", unit: "g", read: (day) => day.addedSugarG },
  { id: "meal_count", label: "Meals recorded", unit: "count", read: (day) => day.mealCount },
  { id: "meal_coverage", label: "Meal coverage", unit: "%", read: (day) => day.mealCoverage },
  { id: "meal_homemade_count", label: "Homemade meals", unit: "count", read: (day) => day.homemadeCount },
  { id: "meal_prepared_count", label: "Prepared / bought meals", unit: "count", read: (day) => day.preparedCount },
  { id: "meal_mixed_count", label: "Mixed meals", unit: "count", read: (day) => day.mixedCount },
  { id: "meal_homemade_share", label: "Homemade share", unit: "%", read: (day) => day.homemadeShare },
  { id: "meal_mouth_heat_average", label: "Mouth heat · average", unit: "1–5", read: (day) => day.mouthHeatAverage },
  { id: "meal_mouth_heat_maximum", label: "Mouth heat · maximum", unit: "1–5", read: (day) => day.mouthHeatMaximum },
  { id: "meal_stomach_overfullness_average", label: "Meal overload · average", unit: "1–5", read: (day) => day.stomachOverfullnessAverage },
  { id: "meal_stomach_overfullness_maximum", label: "Meal overload · maximum", unit: "1–5", read: (day) => day.stomachOverfullnessMaximum },
  { id: "meal_analysis_coverage", label: "Meal analysis coverage", unit: "%", read: (day) => day.analysisCoverage },
  { id: "meal_analysis_confidence", label: "Meal analysis confidence", unit: "%", read: (day) => day.analysisConfidence },
  { id: "meal_food_variety", label: "Distinct meal foods", unit: "count", read: (day) => day.foodVarietyCount },
  { id: "meal_food_groups", label: "Meal food groups", unit: "count", read: (day) => day.foodGroupCount },
];

/** Build the same MatrixSeries shape consumed by the existing relation engine. */
export function mealDailySeries(records: readonly ConfirmedMealRecord[]): Record<MealMetricId, MatrixSeries> {
  const aggregates = aggregateConfirmedMeals(records);
  return Object.fromEntries(seriesSpec.map((spec) => [spec.id, {
    id: spec.id,
    label: spec.label,
    unit: spec.unit,
    kind: "numeric" as const,
    presentation: "amount" as const,
    points: aggregates.flatMap((day): MatrixPoint[] => {
      const value = spec.read(day);
      return value === null ? [] : [{ date: day.date, value }];
    }),
  }])) as Record<MealMetricId, MatrixSeries>;
}
