import type { ConfirmedMealFood, ConfirmedMealRecord, MealDailyAggregate } from "@/domain/lab/meals";
import type { NutritionTargets } from "@/domain/nutrition-targets";

/**
 * The seven dimensions intentionally stay close in size so that no single
 * proxy can dominate the daily result. These are nominal weights; confidence
 * and missing observations reduce the effective weight at calculation time.
 */
export const MEAL_BALANCE_COMPONENT_WEIGHTS = {
  variety: 15,
  foodQuality: 15,
  addedSugar: 15,
  sugarExposure: 12,
  ultraProcessing: 13,
  nutritionCoverage: 15,
  energy: 15,
} as const;

export const MEAL_BALANCE_WEIGHT_TOTAL = Object.values(MEAL_BALANCE_COMPONENT_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
export const MEAL_BALANCE_ALGORITHM_VERSION = "meal-balance-v1" as const;

export type MealBalanceComponentKey = keyof typeof MEAL_BALANCE_COMPONENT_WEIGHTS;
export type MealBalanceStatus = "ready" | "limited" | "insufficient";
export type MealBalanceGoalMode = "maintain" | "build_muscle";
export type MealBalanceEffectDirection = "positive" | "negative" | "caution";

export type MealBalanceComponent = {
  key: MealBalanceComponentKey;
  label: string;
  score: number | null;
  weight: number;
  effectiveWeight: number;
  contribution: number;
  /** 0–1, the fraction of this dimension that is actually observed. */
  observationCoverage: number;
  confidence: number;
  status: MealBalanceStatus;
  observedValue: number | string | null;
  target: string | null;
  summary: string;
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
  status: MealBalanceStatus;
  /** 0–1, based on nominal component weights with an observation. */
  coverage: number;
  /** 0–1, based on the confidence of observed components. */
  confidence: number;
  components: readonly MealBalanceComponent[];
  strongestEffects: readonly MealBalanceEffect[];
  reasons: readonly string[];
};

type ComponentInput = Omit<MealBalanceComponent, "weight" | "effectiveWeight" | "contribution" | "status"> & {
  observationCoverage: number;
};

const componentLabels: Record<MealBalanceComponentKey, string> = {
  variety: "Variété",
  foodQuality: "Qualité alimentaire",
  addedSugar: "Sucre ajouté",
  sugarExposure: "Exposition liquide / concentrée",
  ultraProcessing: "Ultra-transformation",
  nutritionCoverage: "Couverture nutritionnelle",
  energy: "Énergie",
};

const componentOrder: readonly MealBalanceComponentKey[] = [
  "variety",
  "foodQuality",
  "addedSugar",
  "sugarExposure",
  "ultraProcessing",
  "nutritionCoverage",
  "energy",
];

const confidenceByLabel: Record<"low" | "medium" | "high", number> = { low: 0.33, medium: 0.67, high: 1 };

function clamp(value: number, min = 0, max = 100) {
  return Math.min(Math.max(value, min), max);
}

function unit(value: number) {
  return Math.round(value * 100) / 100;
}

function score(value: number) {
  return unit(clamp(value));
}

function finiteNonNegative(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

function confidenceValue(value: ConfirmedMealRecord["analysisConfidence"] | ConfirmedMealFood["confidence"]) {
  return value ? confidenceByLabel[value] : null;
}

function average(values: readonly number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function recordConfidence(records: readonly ConfirmedMealRecord[], fallback: number) {
  const values = records.map((record) => confidenceValue(record.analysisConfidence)).filter((value): value is number => value !== null);
  return average(values) ?? fallback;
}

function foodConfidence(foods: readonly ConfirmedMealFood[], fallback: number) {
  const values = foods.map((food) => confidenceValue(food.confidence)).filter((value): value is number => value !== null);
  return average(values) ?? fallback;
}

function canonicalFoodKey(food: ConfirmedMealFood) {
  const key = food.varietyKey?.trim() || food.name.trim();
  return key ? key.toLocaleLowerCase("fr-FR") : null;
}

function diminishingReturns(value: number, reference: number) {
  return 1 - Math.exp(-value / reference);
}

function mealCoverage(day: MealDailyAggregate) {
  return day.mealCoverage !== null && Number.isFinite(day.mealCoverage)
    ? clamp(day.mealCoverage, 0, 100) / 100
    : day.mealCount > 0 ? 1 : 0;
}

function analysisCoverage(day: MealDailyAggregate) {
  return day.analysisCoverage !== null && Number.isFinite(day.analysisCoverage)
    ? clamp(day.analysisCoverage, 0, 100) / 100
    : null;
}

function baseObservationCoverage(day: MealDailyAggregate, analysis: number | null) {
  const meal = mealCoverage(day);
  return analysis === null ? meal : Math.min(meal, analysis);
}

function componentStatus(input: ComponentInput): MealBalanceStatus {
  if (input.score === null || input.observationCoverage <= 0) return "insufficient";
  return input.observationCoverage >= 0.75 && input.confidence >= 0.75 ? "ready" : "limited";
}

function createComponent(input: ComponentInput): MealBalanceComponent {
  const weight = MEAL_BALANCE_COMPONENT_WEIGHTS[input.key];
  const observationCoverage = clamp(input.observationCoverage, 0, 1);
  const effectiveWeight = input.score === null ? 0 : unit(weight * observationCoverage * clamp(input.confidence, 0, 1));
  const contribution = input.score === null ? 0 : unit(effectiveWeight * input.score / 100);
  return {
    ...input,
    weight,
    observationCoverage,
    effectiveWeight,
    contribution,
    status: componentStatus({ ...input, observationCoverage }),
  };
}

function emptyComponent(key: MealBalanceComponentKey): MealBalanceComponent {
  return createComponent({
    key,
    label: componentLabels[key],
    score: null,
    confidence: 0,
    observedValue: null,
    target: null,
    summary: "Aucune observation exploitable pour cette dimension.",
    observationCoverage: 0,
  });
}

function foodRecordsForDay(day: MealDailyAggregate, records: readonly ConfirmedMealRecord[] | undefined) {
  if (!records) return [];
  const byId = new Map<string, ConfirmedMealRecord>();
  for (const record of records) {
    if (record?.status === "confirmed" && record.id && record.mealDate === day.date) byId.set(record.id, record);
  }
  return [...byId.values()];
}

function foodsForRecords(records: readonly ConfirmedMealRecord[]) {
  return records.flatMap((record) => (record.foods ?? []).filter((food) => food.countedInTotals !== false && food.alcoholic !== true));
}

function varietyComponent(day: MealDailyAggregate, foods: readonly ConfirmedMealFood[], confidence: number, observationCoverage: number): ComponentInput {
  const keys = new Set(foods.flatMap((food) => {
    const key = canonicalFoodKey(food);
    return key ? [key] : [];
  }));
  const groups = new Set(foods.flatMap((food) => food.foodGroups ?? []));
  const distinctCount = keys.size || day.foodVarietyCount;
  const groupCount = groups.size || day.foodGroupCount;
  if (distinctCount === null || distinctCount === undefined || distinctCount <= 0) return { ...emptyComponent("variety"), observationCoverage: 0 };

  // A repeated food key cannot inflate the score. Quantities are not part of
  // this adapter's contract yet, so the safe fallback is distinct foods plus
  // broad groups and meal slots, all with diminishing returns.
  const signals = [
    { value: diminishingReturns(distinctCount, 6), weight: 0.55 },
    ...(groupCount === null || groupCount === undefined ? [] : [{ value: diminishingReturns(groupCount, 4), weight: 0.3 }]),
    { value: diminishingReturns(day.mealCount, 3), weight: 0.15 },
  ];
  const signalWeight = signals.reduce((sum, item) => sum + item.weight, 0);
  return {
    key: "variety",
    label: componentLabels.variety,
    score: score(signals.reduce((sum, item) => sum + item.value * item.weight, 0) / signalWeight * 100),
    confidence,
    observedValue: `${distinctCount} aliment${distinctCount > 1 ? "s" : ""}${groupCount ? ` · ${groupCount} groupe${groupCount > 1 ? "s" : ""}` : ""}`,
    target: "Diversité progressive, sans répétition artificielle",
    summary: "Les rendements sont décroissants et une répétition du même aliment ne crée pas de variété supplémentaire.",
    observationCoverage,
  };
}

const qualityPropertyWeights: Record<string, number> = {
  whole_food: 0.35,
  minimally_processed: 0.2,
  fermented: 0.1,
  fiber_source: 0.15,
  protein_source: 0.1,
  unsaturated_fat_source: 0.1,
};

const qualityFriendlyGroups = new Set(["fruit", "vegetable", "legume", "whole_grain", "plant_protein", "nuts_seeds"]);

function foodQualitySignal(food: ConfirmedMealFood) {
  const properties = food.qualityProperties ?? [];
  const explicitSignal = properties.reduce((sum, property) => sum + (qualityPropertyWeights[property] ?? 0), 0);
  if (explicitSignal > 0) return clamp(explicitSignal, 0, 1);
  return (food.foodGroups ?? []).some((group) => qualityFriendlyGroups.has(group)) ? 0.5 : 0;
}

function qualityComponent(day: MealDailyAggregate, foods: readonly ConfirmedMealFood[], confidence: number, observationCoverage: number): ComponentInput {
  if (!foods.length && day.foodGroupCount === null && day.foodVarietyCount === null) return { ...emptyComponent("foodQuality"), observationCoverage: 0 };
  const signals = foods.length ? foods.map(foodQualitySignal) : [0.5];
  const labelCoverage = foods.length
    ? foods.filter((food) => food.qualityProperties !== undefined).length / foods.length
    : 0;
  return {
    key: "foodQuality",
    label: componentLabels.foodQuality,
    score: score(50 + (average(signals) ?? 0) * 50),
    confidence,
    observedValue: `${Math.round(labelCoverage * 100)}% des aliments avec propriétés décrites`,
    target: "Favoriser les propriétés qualitatives observées",
    summary: "Les propriétés disponibles décrivent les aliments ; leur absence n'est pas interprétée comme une mauvaise qualité.",
    observationCoverage: observationCoverage * Math.max(0.5, labelCoverage),
  };
}

function addedSugarScore(addedSugarG: number) {
  if (addedSugarG <= 0) return 100;
  if (addedSugarG <= 5) return 100 - addedSugarG * 2;
  return 90 * Math.pow(5 / addedSugarG, 0.75);
}

function addedSugarComponent(day: MealDailyAggregate, confidence: number, observationCoverage: number): ComponentInput {
  const value = finiteNonNegative(day.addedSugarG);
  if (value === null) return { ...emptyComponent("addedSugar"), observationCoverage: 0 };
  return {
    key: "addedSugar",
    label: componentLabels.addedSugar,
    score: score(addedSugarScore(value)),
    confidence,
    observedValue: unit(value),
    target: "Idéal personnel : 0 g · tolérance : 5 g/jour",
    summary: value === 0 ? "Aucun sucre ajouté observé ; le sucre d'un fruit entier n'est pas pénalisé ici." : "La pénalité augmente après la tolérance de 5 g, sans confondre sucre ajouté et sucre naturellement présent.",
    observationCoverage,
  };
}

function sugarExposureComponent(foods: readonly ConfirmedMealFood[], confidence: number, observationCoverage: number): ComponentInput {
  const labelled = foods.filter((food) => food.sugarExposure && (food.sugarExposure.liquid !== null || food.sugarExposure.concentrated !== null));
  if (!labelled.length) return { ...emptyComponent("sugarExposure"), observationCoverage: 0 };
  const liquidShare = labelled.filter((food) => food.sugarExposure?.liquid === true).length / labelled.length;
  const concentratedShare = labelled.filter((food) => food.sugarExposure?.concentrated === true).length / labelled.length;
  const liquidCount = labelled.filter((food) => food.sugarExposure?.liquid === true).length;
  const concentratedCount = labelled.filter((food) => food.sugarExposure?.concentrated === true).length;
  return {
    key: "sugarExposure",
    label: componentLabels.sugarExposure,
    score: score(100 - 35 * liquidShare - 35 * concentratedShare),
    confidence,
    observedValue: `${liquidCount} liquide · ${concentratedCount} concentré`,
    target: "Limiter les expositions liquides et concentrées",
    summary: "Une boisson sucrée liquide et concentrée cumule les deux expositions, même sans sucre ajouté.",
    observationCoverage,
  };
}

function ultraProcessingComponent(foods: readonly ConfirmedMealFood[], confidence: number, observationCoverage: number): ComponentInput {
  const labelled = foods.filter((food) => food.novaGroup !== null && food.novaGroup !== undefined);
  if (!labelled.length) return { ...emptyComponent("ultraProcessing"), observationCoverage: 0 };
  const points = { 1: 100, 2: 80, 3: 55, 4: 15 } as const;
  const averageNovaScore = labelled.reduce((sum, food) => sum + points[food.novaGroup as 1 | 2 | 3 | 4], 0) / labelled.length;
  const group4Count = labelled.filter((food) => food.novaGroup === 4).length;
  return {
    key: "ultraProcessing",
    label: componentLabels.ultraProcessing,
    score: score(averageNovaScore),
    confidence,
    observedValue: unit(labelled.reduce((sum, food) => sum + (food.novaGroup ?? 0), 0) / labelled.length),
    target: "Privilégier les groupes NOVA 1–3 lorsque l'information existe",
    summary: `${group4Count} aliment${group4Count > 1 ? "s" : ""} NOVA 4 observé${group4Count > 1 ? "s" : ""} ; les aliments sans étiquette restent inconnus.`,
    observationCoverage,
  };
}

function nutritionCoverageComponent(day: MealDailyAggregate, confidence: number, observationCoverage: number): ComponentInput {
  const explicit = day.analysisCoverage !== null && Number.isFinite(day.analysisCoverage) ? clamp(day.analysisCoverage) : null;
  const knownFields = [day.caloriesKcal, day.proteinG, day.carbsG, day.fatG, day.fiberG].filter((value) => value !== null).length;
  const value = explicit ?? (knownFields ? knownFields / 5 * 100 : null);
  if (value === null) return { ...emptyComponent("nutritionCoverage"), observationCoverage: 0 };
  return {
    key: "nutritionCoverage",
    label: componentLabels.nutritionCoverage,
    score: score(value),
    confidence,
    observedValue: unit(value),
    target: "Connaître les cinq dimensions nutritionnelles de base",
    summary: "La couverture mesure la part des estimations disponibles ; une valeur manquante n'est pas comptée comme zéro nutritionnel.",
    observationCoverage,
  };
}

/** Non-linear energy alignment against the user's existing NutritionTargets. */
export function scoreEnergyForMealBalance(input: {
  caloriesKcal: number;
  targets: NutritionTargets;
  goalMode: MealBalanceGoalMode;
  partialDay?: boolean;
}) {
  const calories = finiteNonNegative(input.caloriesKcal);
  if (calories === null) return null;
  const low = input.targets.caloriesKcal.low;
  const targetHigh = input.targets.caloriesKcal.high;
  const usefulHigh = input.goalMode === "build_muscle"
    ? targetHigh + Math.max(0, finiteNonNegative(input.targets.surplusKcal) ?? 0)
    : targetHigh;
  if (calories >= low && calories <= usefulHigh) return 100;
  if (calories < low) {
    if (low === 0) return 100;
    const raw = 100 * Math.pow(calories / low, 0.65);
    // A partial day can look artificially low because later meals are simply
    // unobserved. Keep that uncertainty from becoming a strong low-energy hit.
    return score(input.partialDay ? Math.max(raw, 75) : raw);
  }
  return score(100 * Math.pow(usefulHigh / calories, 0.8));
}

function energyComponent(day: MealDailyAggregate, targets: NutritionTargets, goalMode: MealBalanceGoalMode, confidence: number, observationCoverage: number): ComponentInput {
  const value = finiteNonNegative(day.caloriesKcal);
  if (value === null) return { ...emptyComponent("energy"), observationCoverage: 0 };
  const usefulHigh = goalMode === "build_muscle"
    ? targets.caloriesKcal.high + Math.max(0, finiteNonNegative(targets.surplusKcal) ?? 0)
    : targets.caloriesKcal.high;
  return {
    key: "energy",
    label: componentLabels.energy,
    score: scoreEnergyForMealBalance({ caloriesKcal: value, targets, goalMode, partialDay: observationCoverage < 0.75 }),
    confidence,
    observedValue: unit(value),
    target: `${targets.caloriesKcal.low}–${usefulHigh} kcal selon la cible existante${goalMode === "build_muscle" ? " et le surplus configuré" : ""}`,
    summary: "La zone utile est un plateau ; les écarts faibles sont graduels et les journées partielles protègent contre un faux bas.",
    observationCoverage,
  };
}

function effectForComponent(component: MealBalanceComponent): MealBalanceEffect | null {
  if (component.score === null) return null;
  const distance = Math.abs(component.score - 75);
  if (distance < 8) return null;
  const direction: MealBalanceEffectDirection = component.score >= 80 ? "positive" : component.score < 45 ? "negative" : "caution";
  return {
    key: component.key,
    label: component.label,
    direction,
    points: unit(component.score),
    summary: component.summary,
  };
}

function emptyResult(): MealBalanceScore {
  return {
    algorithmVersion: MEAL_BALANCE_ALGORITHM_VERSION,
    score: null,
    status: "insufficient",
    coverage: 0,
    confidence: 0,
    components: componentOrder.map(emptyComponent),
    strongestEffects: [],
    reasons: ["Aucun repas confirmé exploitable pour cette journée."],
  };
}

/**
 * Compose a UI-agnostic daily meal balance score. `day` should normally come
 * from `aggregateConfirmedMeals`; `records` is optional and only enriches the
 * food-level dimensions. Missing values remain missing rather than becoming 0.
 */
export function calculateMealBalanceScore(input: {
  day: MealDailyAggregate | null | undefined;
  targets: NutritionTargets;
  records?: readonly ConfirmedMealRecord[];
  goalMode?: MealBalanceGoalMode;
}): MealBalanceScore {
  const day = input.day;
  if (!day || day.mealCount <= 0) return emptyResult();

  const goalMode = input.goalMode ?? "build_muscle";
  const records = foodRecordsForDay(day, input.records);
  const foods = foodsForRecords(records);
  const analysis = analysisCoverage(day);
  const observationCoverage = baseObservationCoverage(day, analysis);
  const dayConfidence = day.analysisConfidence !== null && Number.isFinite(day.analysisConfidence)
    ? clamp(day.analysisConfidence, 0, 100) / 100
    : 0.5;
  const globalConfidence = recordConfidence(records, dayConfidence);
  const foodConfidenceValue = foodConfidence(foods, globalConfidence);
  const foodObservationCoverage = Math.min(observationCoverage, records.length ? 1 : 0.5);

  const rawComponents: ComponentInput[] = [
    varietyComponent(day, foods, foodConfidenceValue, foodObservationCoverage),
    qualityComponent(day, foods, foodConfidenceValue, foodObservationCoverage),
    addedSugarComponent(day, globalConfidence, observationCoverage),
    sugarExposureComponent(foods, foodConfidenceValue, foodObservationCoverage),
    ultraProcessingComponent(foods, foodConfidenceValue, foodObservationCoverage),
    nutritionCoverageComponent(day, globalConfidence, observationCoverage),
    energyComponent(day, input.targets, goalMode, globalConfidence, observationCoverage),
  ];
  const components = rawComponents.map(createComponent);
  const effectiveWeight = components.reduce((sum, component) => sum + component.effectiveWeight, 0);
  const contribution = components.reduce((sum, component) => sum + component.contribution, 0);
  const nominalObservedWeight = components.reduce((sum, component) => sum + (component.score === null ? 0 : component.weight * component.observationCoverage), 0);
  const confidence = nominalObservedWeight ? unit(components.reduce((sum, component) => sum + (component.score === null ? 0 : component.weight * component.confidence * component.observationCoverage), 0) / nominalObservedWeight) : 0;
  const coverage = unit(components.reduce((sum, component) => sum + component.weight * (component.score === null ? 0 : component.observationCoverage), 0) / MEAL_BALANCE_WEIGHT_TOTAL);
  const calculatedScore = effectiveWeight > 0 ? score(contribution / effectiveWeight * 100) : null;
  const status: MealBalanceStatus = calculatedScore === null ? "insufficient" : coverage >= 0.75 && confidence >= 0.75 ? "ready" : "limited";
  const strongestEffects = components
    .map(effectForComponent)
    .filter((effect): effect is MealBalanceEffect => effect !== null)
    .sort((first, second) => Math.abs(second.points - 75) - Math.abs(first.points - 75))
    .slice(0, 3);

  return {
    algorithmVersion: MEAL_BALANCE_ALGORITHM_VERSION,
    score: calculatedScore,
    status,
    coverage,
    confidence,
    components,
    strongestEffects,
    reasons: strongestEffects.map((effect) => `${effect.label} : ${effect.summary}`),
  };
}
