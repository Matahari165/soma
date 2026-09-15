import type { ConfirmedMealFood, ConfirmedMealRecord, MealDailyAggregate } from "@/domain/lab/meals";
import type { MealFoodGroup, MealType } from "@/domain/meals";
import { isPositiveMealVarietyFood, mealPositiveVarietyKey } from "@/domain/meal-taxonomy";
import type { NutritionTargets } from "@/domain/nutrition-targets";

/** Relative priorities; the engine normalises them to 100 points. */
export const MEAL_BALANCE_COMPONENT_WEIGHTS = {
  nutritionAdequacy: 25,
  foodQuality: 25,
  sugarLoad: 25,
  nova: 25,
  positiveVariety: 10,
} as const;

export const MEAL_BALANCE_WEIGHT_TOTAL = Object.values(MEAL_BALANCE_COMPONENT_WEIGHTS)
  .reduce((sum: number, weight: number) => sum + weight, 0);
export const MEAL_BALANCE_NORMALIZED_COMPONENT_WEIGHTS = Object.fromEntries(
  Object.entries(MEAL_BALANCE_COMPONENT_WEIGHTS).map(([key, weight]) => [key, weight / MEAL_BALANCE_WEIGHT_TOTAL * 100]),
) as Record<MealBalanceComponentKey, number>;
export const MEAL_BALANCE_ALGORITHM_VERSION = "meal-balance-v3" as const;
export const MEAL_BALANCE_NEUTRAL_BASE = 50 as const;
export const MEAL_BALANCE_CONFIDENCE_PULL_MAX = 0.1 as const;
export const MEAL_BALANCE_SUGAR_THRESHOLD_G = 20 as const;
export const MEAL_BALANCE_SUGAR_SEVERE_CAP = 25 as const;

export type MealBalanceComponentKey = keyof typeof MEAL_BALANCE_COMPONENT_WEIGHTS;
export type MealBalanceStatus = "ready" | "limited" | "insufficient";
export type MealBalanceGoalMode = "maintain" | "build_muscle";
export type MealBalanceEffectDirection = "positive" | "negative" | "caution";
export type MealEntryState = "recorded" | "skipped";
export type MealSlotState = "not_recorded" | MealEntryState;
export type MealBalancePeriod = { from: string; to: string };

export type MealBalanceSubcomponent = {
  key: string;
  label: string;
  /** Score before the confidence adjustment. Null means no usable input. */
  score: number | null;
  rawScore: number | null;
  /** Score after the small confidence adjustment. */
  adjustedScore: number | null;
  weight: number;
  value: number | string | null;
  target: string | null;
  confidence: number;
  status: MealBalanceStatus;
  summary: string;
};

export type MealBalanceComponent = {
  key: MealBalanceComponentKey;
  label: string;
  /** Backwards-friendly alias for the raw /100 dimension score. */
  score: number | null;
  rawScore: number | null;
  adjustedScore: number | null;
  /** Normalised relative weight in the global score. */
  weight: number;
  /** Normalised contribution to the global score, in points. */
  contribution: number;
  /** Same contribution before confidence adjustment. */
  rawContribution: number;
  /** Explicit severe sugar surcharge; it belongs to the sugar dimension. */
  severityPenalty: number;
  /** Descriptive data availability; never a score multiplier. */
  observationCoverage: number;
  confidence: number;
  status: MealBalanceStatus;
  observedValue: number | string | null;
  target: string | null;
  summary: string;
  period: MealBalancePeriod | null;
  subcomponents: readonly MealBalanceSubcomponent[];
};

export type MealBalanceEffect = {
  key: MealBalanceComponentKey;
  label: string;
  direction: MealBalanceEffectDirection;
  points: number;
  summary: string;
};

export type MealBalanceScore = {
  algorithmVersion: typeof MEAL_BALANCE_ALGORITHM_VERSION;
  score: number | null;
  /** Global score before confidence adjustment; the explicit severe-sugar surcharge is included. */
  rawScore: number | null;
  status: MealBalanceStatus;
  /** Informational confidence; its effect is capped at a 10% pull to 50. */
  confidence: number;
  components: readonly MealBalanceComponent[];
  strongestEffects: readonly MealBalanceEffect[];
  reasons: readonly string[];
  observedDimensions: number;
};

type ComponentInput = {
  key: MealBalanceComponentKey;
  label: string;
  rawScore: number | null;
  confidence: number;
  observedValue: number | string | null;
  target: string | null;
  summary: string;
  observationCoverage: number;
  period: MealBalancePeriod | null;
  subcomponents?: readonly MealBalanceSubcomponent[];
  severityPenalty?: number;
};

type SubcomponentInput = Omit<MealBalanceSubcomponent, "score" | "rawScore" | "adjustedScore" | "status"> & {
  rawScore: number | null;
};

const componentLabels: Record<MealBalanceComponentKey, string> = {
  nutritionAdequacy: "Adéquation nutritionnelle",
  foodQuality: "Qualité alimentaire",
  sugarLoad: "Sucre et concentration",
  nova: "Transformation NOVA",
  positiveVariety: "Variété positive",
};

export const MEAL_BALANCE_COMPONENT_ORDER: readonly MealBalanceComponentKey[] = [
  "nutritionAdequacy",
  "foodQuality",
  "sugarLoad",
  "nova",
  "positiveVariety",
];

const confidenceByLabel: Record<"low" | "medium" | "high", number> = { low: 0.33, medium: 0.67, high: 1 };
const mainMealTypes: readonly MealType[] = ["breakfast", "lunch", "dinner"];
const positiveFoodGroups = new Set<MealFoodGroup>([
  "fruit", "vegetable", "legume", "whole_grain", "refined_grain", "potato",
  "animal_protein", "plant_protein", "egg", "dairy", "nuts_seeds", "added_fat",
]);

function clamp(value: number, min = 0, max = 100) {
  return Math.min(Math.max(value, min), max);
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function unit(value: number) {
  return Math.round(value * 100) / 100;
}

function boundedScore(value: number) {
  return unit(clamp(value));
}

function finiteNonNegative(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

function average(values: readonly number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function confidenceValue(value: ConfirmedMealRecord["analysisConfidence"] | ConfirmedMealFood["confidence"]) {
  return value ? confidenceByLabel[value] : null;
}

function recordConfidence(records: readonly ConfirmedMealRecord[], fallback: number) {
  const values = records
    .map((record) => confidenceValue(record.analysisConfidence))
    .filter((value): value is number => value !== null);
  return average(values) ?? fallback;
}

function foodConfidence(foods: readonly ConfirmedMealFood[], fallback: number) {
  const values = foods
    .map((food) => confidenceValue(food.confidence))
    .filter((value): value is number => value !== null);
  return average(values) ?? fallback;
}

function confidenceForAxis(
  foods: readonly ConfirmedMealFood[],
  observed: readonly ConfirmedMealFood[],
  axis: "novaGroup" | "sugarExposure" | "qualityProperties",
  fallback: number,
) {
  const values = (observed.length ? observed : foods)
    .map((food) => food.observation?.confidence?.[axis] ?? food.confidence)
    .map(confidenceValue)
    .filter((value): value is number => value !== null);
  return average(values) ?? fallback;
}

function adjustForConfidence(rawScore: number, confidence: number) {
  const factor = 1 - MEAL_BALANCE_CONFIDENCE_PULL_MAX + MEAL_BALANCE_CONFIDENCE_PULL_MAX * clamp01(confidence);
  return boundedScore(MEAL_BALANCE_NEUTRAL_BASE + (rawScore - MEAL_BALANCE_NEUTRAL_BASE) * factor);
}

function componentStatus(score: number | null, coverage: number, confidence: number): MealBalanceStatus {
  if (score === null) return "insufficient";
  return coverage >= 0.75 && confidence >= 0.75 ? "ready" : "limited";
}

function createSubcomponent(input: SubcomponentInput): MealBalanceSubcomponent {
  const rawScore = input.rawScore === null ? null : boundedScore(input.rawScore);
  const confidence = clamp01(input.confidence);
  return {
    ...input,
    score: rawScore,
    rawScore,
    adjustedScore: rawScore === null ? null : adjustForConfidence(rawScore, confidence),
    confidence,
    status: componentStatus(rawScore, rawScore === null ? 0 : 1, confidence),
  };
}

function createComponent(input: ComponentInput): MealBalanceComponent {
  const weight = MEAL_BALANCE_NORMALIZED_COMPONENT_WEIGHTS[input.key];
  const rawScore = input.rawScore === null ? null : boundedScore(input.rawScore);
  const confidence = clamp01(input.confidence);
  const adjustedScore = rawScore === null ? null : adjustForConfidence(rawScore, confidence);
  const severityPenalty = unit(Math.max(0, input.severityPenalty ?? 0));
  const confidenceFactor = 1 - MEAL_BALANCE_CONFIDENCE_PULL_MAX + MEAL_BALANCE_CONFIDENCE_PULL_MAX * confidence;
  const rawContribution = rawScore === null
    ? 0
    : unit(weight * (rawScore - MEAL_BALANCE_NEUTRAL_BASE) / 100 - severityPenalty);
  const contribution = adjustedScore === null
    ? 0
    : unit(weight * (adjustedScore - MEAL_BALANCE_NEUTRAL_BASE) / 100 - severityPenalty * confidenceFactor);
  const observationCoverage = clamp01(input.observationCoverage);
  return {
    ...input,
    score: rawScore,
    rawScore,
    adjustedScore,
    weight,
    rawContribution,
    contribution,
    severityPenalty,
    observationCoverage,
    confidence,
    status: componentStatus(rawScore, observationCoverage, confidence),
    subcomponents: input.subcomponents ?? [],
  };
}

function emptyComponent(key: MealBalanceComponentKey, period: MealBalancePeriod | null = null): MealBalanceComponent {
  return createComponent({
    key,
    label: componentLabels[key],
    rawScore: null,
    confidence: 0,
    observedValue: null,
    target: null,
    summary: "Aucune observation exploitable pour cette dimension.",
    observationCoverage: 0,
    period,
  });
}

function emptyResult(): MealBalanceScore {
  return {
    algorithmVersion: MEAL_BALANCE_ALGORITHM_VERSION,
    score: null,
    rawScore: null,
    status: "insufficient",
    confidence: 0,
    components: MEAL_BALANCE_COMPONENT_ORDER.map((key) => emptyComponent(key)),
    strongestEffects: [],
    reasons: ["Aucun repas confirmé exploitable pour cette journée."],
    observedDimensions: 0,
  };
}

function periodForDate(date: string, days = 1): MealBalancePeriod {
  return { from: addDays(date, -(Math.max(1, days) - 1)), to: date };
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function isSkippedRecord(record: ConfirmedMealRecord) {
  return (record as ConfirmedMealRecord & { entryState?: MealEntryState }).entryState === "skipped";
}

function confirmedRecords(records: readonly ConfirmedMealRecord[] | undefined) {
  const byId = new Map<string, ConfirmedMealRecord>();
  for (const record of records ?? []) {
    if (!record || record.status !== "confirmed" || !record.id || isSkippedRecord(record)) continue;
    byId.set(record.id, record);
  }
  return [...byId.values()];
}

function foodRecordsForDay(day: MealDailyAggregate, records: readonly ConfirmedMealRecord[] | undefined) {
  return confirmedRecords(records).filter((record) => record.mealDate === day.date);
}

function portionGrams(food: ConfirmedMealFood) {
  const value = food.quantity?.grams ?? food.estimatedGrams;
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Unknown portions use one item as a neutral fallback; explicit zero has zero weight. */
function foodWeight(food: ConfirmedMealFood) {
  return portionGrams(food) ?? 1;
}

function weightedShare(foods: readonly ConfirmedMealFood[], predicate: (food: ConfirmedMealFood, index: number) => boolean) {
  const total = foods.reduce((sum, food) => sum + foodWeight(food), 0);
  if (total <= 0) return null;
  return foods.reduce((sum, food, index) => sum + (predicate(food, index) ? foodWeight(food) : 0), 0) / total;
}

function weightedAverage<T>(items: readonly T[], read: (item: T) => number | null, weight: (item: T) => number) {
  let totalWeight = 0;
  let total = 0;
  for (const item of items) {
    const value = read(item);
    const itemWeight = weight(item);
    if (value === null || itemWeight <= 0) continue;
    total += value * itemWeight;
    totalWeight += itemWeight;
  }
  return totalWeight > 0 ? total / totalWeight : null;
}

function foodsForRecords(records: readonly ConfirmedMealRecord[]) {
  return records.flatMap((record) => {
    const foods = record.foods ?? [];
    const byId = new Map(foods.flatMap((food) => food.id ? [[food.id, food] as const] : []));
    const parentIds = new Set(foods.flatMap((food) => food.parentId ? [food.parentId] : []));
    return foods.filter((food) => {
      if (food.alcoholic === true || food.countedInTotals === false) return false;
      if (food.parentId && byId.get(food.parentId)?.countedInTotals === true) return false;
      if (food.id && parentIds.has(food.id) && food.countedInTotals !== true) return false;
      return true;
    });
  });
}

function qualityRoles(food: ConfirmedMealFood) {
  const groups = new Set(food.foodGroups ?? []);
  const properties = new Set(food.qualityProperties ?? []);
  return {
    plant: [...groups].some((group) => ["fruit", "vegetable", "legume", "whole_grain", "potato", "plant_protein", "nuts_seeds"].includes(group)),
    protein: properties.has("protein_source") || [...groups].some((group) => ["animal_protein", "plant_protein", "egg", "dairy"].includes(group)),
    fiber: properties.has("fiber_source") || [...groups].some((group) => ["fruit", "vegetable", "legume", "whole_grain", "potato", "nuts_seeds"].includes(group)),
    unsaturatedFat: properties.has("unsaturated_fat_source") || groups.has("nuts_seeds"),
  };
}

function qualityObservation(food: ConfirmedMealFood) {
  return Boolean(food.qualityProperties !== undefined || food.foodGroups?.length);
}

function qualityComponent(
  foods: readonly ConfirmedMealFood[],
  confidence: number,
  period: MealBalancePeriod,
) {
  const observed = foods.filter(qualityObservation);
  if (!observed.length) return emptyComponent("foodQuality", period);
  const roleWeights = [
    { key: "plant", label: "Sources végétales", weight: 0.4 },
    { key: "protein", label: "Sources de protéines", weight: 0.3 },
    { key: "fiber", label: "Sources de fibres", weight: 0.2 },
    { key: "unsaturatedFat", label: "Graisses insaturées", weight: 0.1 },
  ] as const;
  const roles = observed.map(qualityRoles);
  const shares = roleWeights.map((role) => weightedShare(observed, (_, index) => roles[index]?.[role.key] === true) ?? 0);
  const rawScore = 50 + shares.reduce((sum, share, index) => sum + share * roleWeights[index].weight, 0) * 50;
  const axisConfidence = confidenceForAxis(foods, observed, "qualityProperties", confidence);
  const subcomponents = roleWeights.map((role, index) => createSubcomponent({
    key: role.key,
    label: role.label,
    rawScore: shares[index] * 100,
    weight: role.weight * 100,
    value: unit(shares[index] * 100),
    target: "Présence dans les aliments observés",
    confidence: axisConfidence,
    summary: "Part pondérée des aliments observés qui remplissent ce rôle.",
  }));
  return createComponent({
    key: "foodQuality",
    label: componentLabels.foodQuality,
    rawScore,
    confidence: axisConfidence,
    observedValue: `${Math.round(observed.length / Math.max(1, foods.length) * 100)} % des aliments décrits`,
    target: "Présence de rôles favorables, sans juger la transformation",
    summary: "La qualité décrit les rôles favorables présents : végétaux, protéines, fibres et graisses insaturées. NOVA et le sucre sont évalués séparément.",
    observationCoverage: observed.length / Math.max(1, foods.length),
    period,
    subcomponents,
  });
}

function finiteLikely(value: { likely: number } | null | undefined) {
  return value && Number.isFinite(value.likely) && value.likely >= 0 ? value.likely : null;
}

function scoreAgainstRange(value: number | null, target: { low: number; high: number }) {
  if (value === null) return null;
  if (value >= target.low && value <= target.high) return 100;
  if (value < target.low) return target.low <= 0 ? 100 : boundedScore(100 * Math.pow(value / target.low, 0.7));
  return target.high <= 0 ? 0 : boundedScore(100 * Math.pow(target.high / value, 0.8));
}

function mainMealIsUnrecorded(slotStates: Partial<Record<MealType, MealSlotState>> | undefined) {
  if (!slotStates) return false;
  return mainMealTypes.some((slot) => slotStates[slot] === undefined || slotStates[slot] === "not_recorded");
}

function nutritionAdequacyComponent(
  day: MealDailyAggregate,
  targets: NutritionTargets,
  records: readonly ConfirmedMealRecord[],
  goalMode: MealBalanceGoalMode,
  slotStates: Partial<Record<MealType, MealSlotState>> | undefined,
  period: MealBalancePeriod,
) {
  if (mainMealIsUnrecorded(slotStates)) {
    return createComponent({
      key: "nutritionAdequacy",
      label: componentLabels.nutritionAdequacy,
      rawScore: null,
      confidence: 0,
      observedValue: null,
      target: "Les trois repas principaux doivent être déclarés",
      summary: "Un repas principal n’est pas renseigné. L’adéquation reste indisponible et aucune autre dimension n’est pénalisée.",
      observationCoverage: 0,
      period,
    });
  }
  const specs = [
    { key: "calories", label: "Calories", value: finiteNonNegative(day.caloriesKcal), target: targets.caloriesKcal, unit: "kcal", weight: 0.2 },
    { key: "protein", label: "Protéines", value: finiteNonNegative(day.proteinG), target: targets.proteinG, unit: "g", weight: 0.2 },
    { key: "carbs", label: "Glucides", value: finiteNonNegative(day.carbsG), target: targets.carbsG, unit: "g", weight: 0.2 },
    { key: "fat", label: "Lipides", value: finiteNonNegative(day.fatG), target: targets.fatG, unit: "g", weight: 0.2 },
    { key: "fiber", label: "Fibres", value: finiteNonNegative(day.fiberG), target: targets.fiberG, unit: "g", weight: 0.2 },
  ] as const;
  const confidence = recordConfidence(records, day.analysisConfidence === null ? 0.5 : clamp01(day.analysisConfidence / 100));
  const subcomponents = specs.map((item) => {
    const high = item.key === "calories" && goalMode === "build_muscle"
      ? item.target.high + Math.max(0, finiteNonNegative(targets.surplusKcal) ?? 0)
      : item.target.high;
    const rawScore = scoreAgainstRange(item.value, { low: item.target.low, high });
    return createSubcomponent({
      key: item.key,
      label: item.label,
      rawScore,
      weight: item.weight * 100,
      value: item.value,
      target: `${item.target.low}–${high} ${item.unit}`,
      confidence,
      summary: rawScore === null ? "Donnée manquante : elle n’est pas remplacée par zéro." : "Comparaison progressive avec la plage personnelle.",
    });
  });
  const known = subcomponents.filter((item) => item.rawScore !== null);
  if (!known.length) {
    return createComponent({
      key: "nutritionAdequacy",
      label: componentLabels.nutritionAdequacy,
      rawScore: null,
      confidence,
      observedValue: null,
      target: "Plages personnelles de calories et nutriments",
      summary: "Aucune estimation nutritionnelle exploitable pour cette journée.",
      observationCoverage: 0,
      period,
      subcomponents,
    });
  }
  const rawScore = known.reduce((sum, item) => sum + (item.rawScore ?? 0), 0) / known.length;
  return createComponent({
    key: "nutritionAdequacy",
    label: componentLabels.nutritionAdequacy,
    rawScore,
    confidence,
    observedValue: `${known.length}/5 indicateurs disponibles`,
    target: "Plages personnelles de calories, protéines, glucides, lipides et fibres",
    summary: "Chaque objectif connu est comparé à sa plage personnelle. Les indicateurs absents sont ignorés, jamais comptés comme zéro.",
    observationCoverage: known.length / specs.length,
    period,
    subcomponents,
  });
}

/** Public helper for the energy sub-indicator. */
export function scoreEnergyForMealBalance(input: {
  caloriesKcal: number;
  targets: NutritionTargets;
  goalMode: MealBalanceGoalMode;
  partialDay?: boolean;
  observationCoverage?: number;
}) {
  const high = input.goalMode === "build_muscle"
    ? input.targets.caloriesKcal.high + Math.max(0, finiteNonNegative(input.targets.surplusKcal) ?? 0)
    : input.targets.caloriesKcal.high;
  return scoreAgainstRange(finiteNonNegative(input.caloriesKcal), { low: input.targets.caloriesKcal.low, high });
}

function sugarScoreForLoad(sugarG: number) {
  if (sugarG <= 0) return 100;
  // Reach zero at the validated 20 g threshold: with the normalised 22.73%
  // weight, 20 g removes 11.36 points from the global score relative to the
  // neutral base. The explicit severe surcharge below then makes the excess
  // after 20 g visible instead of hiding it behind the /100 component cap.
  return boundedScore(100 - sugarG * 5);
}

/** At 20 g the global loss is about 11.36 points with the validated weight. */
export function scoreSugarLoadForMealBalance(sugarG: number | null) {
  return sugarG === null ? null : sugarScoreForLoad(sugarG);
}

function isConcentratedFood(food: ConfirmedMealFood) {
  if (food.sugarExposure?.concentrated === true) return true;
  const text = `${food.name} ${food.varietyKey ?? ""}`.toLocaleLowerCase("fr-FR");
  return food.foodGroups?.includes("beverage") === true && /jus|juice|nectar|smoothie/.test(text);
}

function foodSugarValue(food: ConfirmedMealFood, key: "sugarG" | "addedSugarG") {
  const value = (food as ConfirmedMealFood & Record<"sugarG" | "addedSugarG", { likely: number } | null | undefined>)[key];
  return finiteLikely(value);
}

function sugarLoadValues(day: MealDailyAggregate, foods: readonly ConfirmedMealFood[]) {
  const loads = foods.flatMap((food) => {
    const concentrated = isConcentratedFood(food);
    const value = foodSugarValue(food, concentrated ? "sugarG" : "addedSugarG");
    return value === null ? [] : [{ value, concentrated }];
  });
  if (loads.length) {
    const added = loads.filter((load) => !load.concentrated).reduce((sum, load) => sum + load.value, 0);
    const concentrated = loads.filter((load) => load.concentrated).reduce((sum, load) => sum + load.value, 0);
    return {
      addedSugarG: added,
      concentratedSugarG: concentrated,
      totalG: added + concentrated,
      observationCoverage: loads.length / Math.max(1, foods.length),
    };
  }
  const concentratedFoods = foods.filter(isConcentratedFood);
  const totalSugar = finiteNonNegative(day.sugarG);
  const addedSugar = finiteNonNegative(day.addedSugarG);
  if (concentratedFoods.length && totalSugar !== null && (concentratedFoods.length === foods.length || concentratedFoods.length === 1)) {
    const allConcentrated = concentratedFoods.length === foods.length;
    return {
      addedSugarG: allConcentrated ? 0 : addedSugar,
      concentratedSugarG: totalSugar,
      totalG: totalSugar + (allConcentrated ? 0 : addedSugar ?? 0),
      observationCoverage: 1,
    };
  }
  if (addedSugar !== null) return { addedSugarG: addedSugar, concentratedSugarG: 0, totalG: addedSugar, observationCoverage: 1 };
  return { addedSugarG: null, concentratedSugarG: null, totalG: null, observationCoverage: 0 };
}

function sugarComponent(
  day: MealDailyAggregate,
  foods: readonly ConfirmedMealFood[],
  records: readonly ConfirmedMealRecord[],
  confidence: number,
  period: MealBalancePeriod,
) {
  const values = sugarLoadValues(day, foods);
  if (values.totalG === null) return emptyComponent("sugarLoad", period);
  const axisConfidence = foods.some((food) => foodSugarValue(food, "sugarG") !== null || foodSugarValue(food, "addedSugarG") !== null)
    ? foodConfidence(foods, confidence)
    : recordConfidence(records, confidence);
  const severePenalty = values.totalG > MEAL_BALANCE_SUGAR_THRESHOLD_G
    ? Math.min(MEAL_BALANCE_SUGAR_SEVERE_CAP, (values.totalG - MEAL_BALANCE_SUGAR_THRESHOLD_G) * 0.75)
    : 0;
  const subcomponents = [
    values.addedSugarG === null ? null : createSubcomponent({
      key: "addedSugar",
      label: "Sucre ajouté ordinaire",
      rawScore: sugarScoreForLoad(values.addedSugarG),
      weight: 50,
      value: values.addedSugarG,
      target: "0–20 g/jour",
      confidence: axisConfidence,
      summary: "Sucre ajouté des aliments ordinaires.",
    }),
    values.concentratedSugarG === null ? null : createSubcomponent({
      key: "concentratedSugar",
      label: "Sucre total concentré",
      rawScore: sugarScoreForLoad(values.concentratedSugarG),
      weight: 50,
      value: values.concentratedSugarG,
      target: "Limiter les apports concentrés, notamment les jus",
      confidence: axisConfidence,
      summary: "Le sucre total d’un aliment concentré est utilisé une seule fois, même si son sucre ajouté vaut zéro.",
    }),
  ].filter((item): item is MealBalanceSubcomponent => item !== null);
  return createComponent({
    key: "sugarLoad",
    label: componentLabels.sugarLoad,
    rawScore: sugarScoreForLoad(values.totalG),
    confidence: axisConfidence,
    observedValue: `${unit(values.totalG)} g de charge sucrée`,
    target: "0 g idéal · 20 g seuil fort · 40 g zone très sévère",
    summary: values.totalG > MEAL_BALANCE_SUGAR_THRESHOLD_G
      ? `Charge sucrée élevée : ${unit(severePenalty)} point${severePenalty > 1 ? "s" : ""} supplémentaire${severePenalty > 1 ? "s" : ""} retiré${severePenalty > 1 ? "s" : ""} au global après 20 g.`
      : "La charge combine le sucre ajouté ordinaire et le sucre total des aliments concentrés ; la forme liquide seule ne pénalise pas.",
    observationCoverage: values.observationCoverage,
    period,
    subcomponents,
    severityPenalty: severePenalty,
  });
}

function novaObservation(food: ConfirmedMealFood) {
  return food.novaGroup !== undefined && food.novaGroup !== null && food.observation?.novaGroup !== "unknown";
}

function novaComponent(foods: readonly ConfirmedMealFood[], confidence: number, period: MealBalancePeriod) {
  const observed = foods.filter(novaObservation);
  if (!observed.length) return emptyComponent("nova", period);
  const points = { 1: 100, 2: 70, 3: 35, 4: 5 } as const;
  const rawScore = weightedAverage(observed, (food) => points[food.novaGroup as 1 | 2 | 3 | 4], foodWeight);
  if (rawScore === null) return emptyComponent("nova", period);
  const axisConfidence = confidenceForAxis(foods, observed, "novaGroup", confidence);
  const subcomponents = ([1, 2, 3, 4] as const).map((group) => createSubcomponent({
    key: `nova-${group}`,
    label: `NOVA ${group}`,
    rawScore: group === 1 ? 100 : group === 2 ? 70 : group === 3 ? 35 : 5,
    weight: 25,
    value: observed.filter((food) => food.novaGroup === group).length,
    target: null,
    confidence: axisConfidence,
    summary: "Répartition des aliments observés dans le classement NOVA.",
  }));
  const group4Count = observed.filter((food) => food.novaGroup === 4).length;
  return createComponent({
    key: "nova",
    label: componentLabels.nova,
    rawScore,
    confidence: axisConfidence,
    observedValue: unit(weightedAverage(observed, (food) => food.novaGroup ?? null, foodWeight) ?? 0),
    target: "NOVA 1 = 100 · NOVA 2 = 70 · NOVA 3 = 35 · NOVA 4 = 5",
    summary: `${group4Count} aliment${group4Count > 1 ? "s" : ""} NOVA 4 observé${group4Count > 1 ? "s" : ""} ; les aliments sans classement restent inconnus.`,
    observationCoverage: observed.length / Math.max(1, foods.length),
    period,
    subcomponents,
  });
}

function positiveFamily(food: ConfirmedMealFood) {
  if (!isPositiveMealVarietyFood(food)) return null;
  const groups = (food.foodGroups ?? []).filter((group) => positiveFoodGroups.has(group));
  if (groups.includes("fruit")) return "fruits";
  if (groups.includes("vegetable")) return "légumes";
  if (groups.includes("legume")) return "légumineuses";
  if (groups.some((group) => ["whole_grain", "refined_grain", "potato"].includes(group))) return "féculents";
  if (groups.some((group) => ["animal_protein", "plant_protein", "egg", "dairy"].includes(group))) return "protéines";
  if (groups.some((group) => ["nuts_seeds", "added_fat"].includes(group))) return "graisses favorables";
  return null;
}

function positiveVarietyKey(food: ConfirmedMealFood) {
  const family = positiveFamily(food);
  const key = mealPositiveVarietyKey(food);
  return family && key ? { family, key } : null;
}

function recordsWithinWindow(records: readonly ConfirmedMealRecord[], endDate: string) {
  const from = addDays(endDate, -6);
  return records.filter((record) => record.mealDate >= from && record.mealDate <= endDate);
}

function positiveVarietyComponent(day: MealDailyAggregate, records: readonly ConfirmedMealRecord[], fallbackConfidence: number) {
  const windowRecords = recordsWithinWindow(records, day.date);
  const occurrences = windowRecords.flatMap((record) => foodsForRecords([record]).flatMap((food) => {
    const value = positiveVarietyKey(food);
    return value ? [{ food, ...value, date: record.mealDate }] : [];
  }));
  const period = periodForDate(day.date, 7);
  const observedLists = windowRecords.filter((record) => record.foods !== undefined).length;
  const observationCoverage = windowRecords.length ? observedLists / windowRecords.length : 0;
  if (!occurrences.length) {
    const empty = emptyComponent("positiveVariety", period);
    return { ...empty, summary: "Aucun aliment positif classé dans les sept derniers jours ; bonbons, desserts sucrés, boissons, sauces et aliments non classés ne créent pas de bonus." };
  }
  const distinctFoods = new Set(occurrences.map((item) => item.key));
  const families = new Set(occurrences.map((item) => item.family));
  const occurrencesByFamily = new Map<string, number>();
  for (const occurrence of occurrences) occurrencesByFamily.set(occurrence.family, (occurrencesByFamily.get(occurrence.family) ?? 0) + 1);
  const totalOccurrences = occurrences.length;
  const hhi = [...occurrencesByFamily.values()].reduce((sum, count) => sum + Math.pow(count / totalOccurrences, 2), 0);
  const maximumHhi = families.size > 1 ? 1 / families.size : 1;
  const balance = families.size <= 1 ? 0 : clamp((1 - hhi) / (1 - maximumHhi), 0, 1);
  const signals = [
    { key: "distinctFoods", label: "Aliments positifs distincts", score: clamp(distinctFoods.size / 14 * 100), weight: 0.5, value: distinctFoods.size },
    { key: "families", label: "Familles positives distinctes", score: clamp(families.size / 6 * 100), weight: 0.3, value: families.size },
    { key: "categoryBalance", label: "Équilibre des familles", score: balance * 100, weight: 0.2, value: unit(balance * 100) },
  ] as const;
  const rawScore = signals.reduce((sum, signal) => sum + signal.score * signal.weight, 0);
  const confidence = recordConfidence(windowRecords, fallbackConfidence);
  const subcomponents = signals.map((signal) => createSubcomponent({
    key: signal.key,
    label: signal.label,
    rawScore: signal.score,
    weight: signal.weight * 100,
    value: signal.value,
    target: signal.key === "distinctFoods" ? "Environ 14 aliments positifs différents sur 7 jours" : signal.key === "families" ? "Diversifier les grandes familles positives" : "Répartir les aliments entre plusieurs familles",
    confidence,
    summary: "Ce sous-indicateur ne compte que des aliments positifs classés.",
  }));
  const datesByFood = new Map<string, Set<string>>();
  for (const occurrence of occurrences) datesByFood.set(occurrence.key, new Set([...(datesByFood.get(occurrence.key) ?? []), occurrence.date]));
  const repeated = [...datesByFood.entries()].sort(([, first], [, second]) => second.size - first.size)[0];
  const repetitionAlert = repeated && repeated[1].size >= 5
    ? ` Répétition informative : « ${repeated[0]} » apparaît ${repeated[1].size} jours sur 7 ; cela ne retire pas de points directement.`
    : "";
  return createComponent({
    key: "positiveVariety",
    label: componentLabels.positiveVariety,
    rawScore,
    confidence,
    observedValue: `${distinctFoods.size} aliments · ${families.size} familles · fenêtre de 7 jours`,
    target: "Diversifier les aliments positifs et leurs familles",
    summary: `La variété positive exclut les aliments sucrés, les boissons, les sauces et les éléments non classés.${repetitionAlert}`,
    observationCoverage,
    period,
    subcomponents,
  });
}

function effectForComponent(component: MealBalanceComponent): MealBalanceEffect | null {
  if (component.adjustedScore === null) return null;
  const isSevere = component.severityPenalty > 0;
  const distance = Math.abs(component.adjustedScore - MEAL_BALANCE_NEUTRAL_BASE);
  if (distance < 8 && !isSevere) return null;
  const direction: MealBalanceEffectDirection = component.contribution < -1 || component.adjustedScore < 45
    ? "negative"
    : component.adjustedScore >= 80
      ? "positive"
      : "caution";
  return { key: component.key, label: component.label, direction, points: component.adjustedScore, summary: component.summary };
}

/**
 * Compose the daily food score. Meal coverage is context only: it never
 * becomes a multiplier. A missing main meal makes adequacy unavailable; it
 * cannot lower the other four dimensions.
 */
export function calculateMealBalanceScore(input: {
  day: MealDailyAggregate | null | undefined;
  targets: NutritionTargets;
  records?: readonly ConfirmedMealRecord[];
  historyRecords?: readonly ConfirmedMealRecord[];
  goalMode?: MealBalanceGoalMode;
  slotStates?: Partial<Record<MealType, MealSlotState>>;
}): MealBalanceScore {
  const day = input.day;
  if (!day || day.mealCount <= 0) return emptyResult();
  const goalMode = input.goalMode ?? "maintain";
  const records = foodRecordsForDay(day, input.records);
  const historyRecords = confirmedRecords(input.historyRecords ?? input.records);
  const foods = foodsForRecords(records);
  const dayPeriod = periodForDate(day.date);
  const dayConfidence = day.analysisConfidence !== null && Number.isFinite(day.analysisConfidence)
    ? clamp01(day.analysisConfidence / 100)
    : 0.5;
  const recordEvidence = recordConfidence(records, dayConfidence);
  const components = [
    nutritionAdequacyComponent(day, input.targets, records, goalMode, input.slotStates, dayPeriod),
    qualityComponent(foods, foodConfidence(foods, recordEvidence), dayPeriod),
    sugarComponent(day, foods, records, recordEvidence, dayPeriod),
    novaComponent(foods, foodConfidence(foods, recordEvidence), dayPeriod),
    positiveVarietyComponent(day, historyRecords, recordEvidence),
  ];
  const observed = components.filter((component) => component.rawScore !== null);
  if (!observed.length) {
    return {
      ...emptyResult(),
      components,
      reasons: ["Aucune dimension ne dispose encore d’une observation exploitable."],
    };
  }
  const rawAdjustment = observed.reduce((sum, component) => sum + component.rawContribution, 0);
  const adjustment = observed.reduce((sum, component) => sum + component.contribution, 0);
  const rawScore = boundedScore(MEAL_BALANCE_NEUTRAL_BASE + rawAdjustment);
  const finalScore = boundedScore(MEAL_BALANCE_NEUTRAL_BASE + adjustment);
  const weight = observed.reduce((sum, component) => sum + component.weight, 0);
  const confidence = weight > 0
    ? unit(observed.reduce((sum, component) => sum + component.weight * component.confidence, 0) / weight)
    : 0;
  const status: MealBalanceStatus = observed.length === MEAL_BALANCE_COMPONENT_ORDER.length && confidence >= 0.75 ? "ready" : "limited";
  const strongestEffects = components
    .map(effectForComponent)
    .filter((effect): effect is MealBalanceEffect => effect !== null)
    .sort((first, second) => {
      const rank = { negative: 0, caution: 1, positive: 2 } as const;
      return rank[first.direction] - rank[second.direction] || Math.abs(second.points - 50) - Math.abs(first.points - 50);
    })
    .slice(0, 3);
  return {
    algorithmVersion: MEAL_BALANCE_ALGORITHM_VERSION,
    score: finalScore,
    rawScore,
    status,
    confidence,
    components,
    strongestEffects,
    reasons: strongestEffects.map((effect) => `${effect.label} : ${effect.summary}`),
    observedDimensions: observed.length,
  };
}
