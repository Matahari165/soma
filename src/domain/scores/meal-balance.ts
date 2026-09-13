import type { ConfirmedMealFood, ConfirmedMealRecord, MealDailyAggregate } from "@/domain/lab/meals";
import type { NutritionTargets } from "@/domain/nutrition-targets";

/**
 * Six behavioural dimensions make up the 100-point score. Nutrition
 * coverage remains visible as a proof metric, but is deliberately
 * non-contributive: knowing more nutrition numbers must not improve the
 * behavioural score by itself.
 */
export const MEAL_BALANCE_COMPONENT_WEIGHTS = {
  variety: 10,
  foodQuality: 20,
  addedSugar: 20,
  sugarExposure: 15,
  ultraProcessing: 20,
  nutritionCoverage: 0,
  energy: 15,
} as const;

export const MEAL_BALANCE_WEIGHT_TOTAL = Object.values(MEAL_BALANCE_COMPONENT_WEIGHTS).reduce((sum: number, weight: number) => sum + weight, 0);
export const MEAL_BALANCE_ALGORITHM_VERSION = "meal-balance-v2" as const;
export const MEAL_BALANCE_ADVERSE_PENALTY_CAP = 25 as const;
export const MEAL_BALANCE_NEUTRAL_BASE = 50 as const;

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
  /** Weighted adjustment in points versus the neutral base; can be negative. */
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

export type MealBalanceAdverseSignalKey = "addedSugar" | "sugarExposure" | "ultraProcessing" | "alcohol";

export type MealBalanceAdverseSignal = {
  key: MealBalanceAdverseSignalKey;
  label: string;
  /** Raw risk before confidence weighting, on the same 0–100 scale as a component. */
  risk: number;
  /** Risk retained after applying the evidence confidence. */
  weightedRisk: number;
  /** 0–1 confidence for this signal, kept separate from the day confidence. */
  confidence: number;
};

export type MealBalanceWorstMeal = {
  mealId: string;
  type: ConfirmedMealRecord["mealType"];
  /** Bounded points removed from the daily score, never a /100 score. */
  penalty: number;
  signals: readonly MealBalanceAdverseSignal[];
  confidence: number;
  observationStatus: MealBalanceStatus;
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
  /** Score before the bounded adverse penalty: neutral base + component adjustments. */
  baseScore: number | null;
  /** Bounded adverse points removed after the six behavioural dimensions. */
  adversePenalty: number;
  /** Explainable source of `adversePenalty`; null means no adverse signal observed. */
  worstMeal: MealBalanceWorstMeal | null;
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

/**
 * Keep an observed negative signal actionable even when confidence is low,
 * while pulling positive claims towards the neutral midpoint when evidence
 * is incomplete. Unknown dimensions are neutral rather than zero.
 */
function evidenceAdjustedScore(input: Pick<MealBalanceComponent, "score" | "confidence" | "observationCoverage">) {
  if (input.score === null || input.observationCoverage <= 0) return MEAL_BALANCE_NEUTRAL_BASE;
  if (input.score <= 50) return score(input.score);
  const evidence = clamp(input.confidence, 0, 1) * clamp(input.observationCoverage, 0, 1);
  return score(MEAL_BALANCE_NEUTRAL_BASE + (input.score - MEAL_BALANCE_NEUTRAL_BASE) * evidence);
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

type FoodObservationAxis = "portion" | "novaGroup" | "sugarExposure" | "qualityProperties";

function confidenceForAxis(foods: readonly ConfirmedMealFood[], observed: readonly ConfirmedMealFood[], axis: FoodObservationAxis, fallback: number) {
  const values = (observed.length ? observed : foods)
    .map((food) => food.observation?.confidence?.[axis] ?? food.confidence)
    .map(confidenceValue)
    .filter((value): value is number => value !== null);
  return average(values) ?? fallback;
}

function portionGrams(food: ConfirmedMealFood) {
  const value = food.quantity?.grams ?? food.estimatedGrams;
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Unknown portions use one item as a neutral fallback; explicit zero has zero weight. */
function foodWeight(food: ConfirmedMealFood) {
  return portionGrams(food) ?? 1;
}

function weightedShare(foods: readonly ConfirmedMealFood[], predicate: (food: ConfirmedMealFood) => boolean) {
  const total = foods.reduce((sum, food) => sum + foodWeight(food), 0);
  if (total <= 0) return null;
  return foods.reduce((sum, food) => sum + (predicate(food) ? foodWeight(food) : 0), 0) / total;
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

function foodCoverage(day: MealDailyAggregate, foods: readonly ConfirmedMealFood[], key: "qualityProperties" | "sugarExposure" | "novaGroup" | "portion", observed: (food: ConfirmedMealFood) => boolean) {
  const aggregateCoverage = day.foodObservationCoverage?.[key];
  return aggregateCoverage !== null && aggregateCoverage !== undefined && Number.isFinite(aggregateCoverage)
    ? clamp(aggregateCoverage, 0, 1)
    : foods.length ? foods.filter(observed).length / foods.length : 0;
}

function qualityObservation(food: ConfirmedMealFood) {
  return food.observation?.qualityProperties !== "unknown" && food.qualityProperties !== undefined;
}

function sugarExposureObservation(food: ConfirmedMealFood) {
  return food.observation?.sugarExposure !== "unknown"
    && food.sugarExposure !== undefined
    && food.sugarExposure !== null
    && food.sugarExposure.liquid !== null
    && food.sugarExposure.concentrated !== null;
}

function novaObservation(food: ConfirmedMealFood) {
  return food.observation?.novaGroup !== "unknown" && food.novaGroup !== undefined && food.novaGroup !== null;
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
  const contribution = weight <= 0
    ? 0
    : unit(weight * (evidenceAdjustedScore({ ...input, observationCoverage }) - MEAL_BALANCE_NEUTRAL_BASE) / 100);
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
  return records.flatMap((record) => {
    const foods = record.foods ?? [];
    const byId = new Map(foods.flatMap((food) => food.id ? [[food.id, food] as const] : []));
    const parentIds = new Set(foods.flatMap((food) => food.parentId ? [food.parentId] : []));
    return foods.filter((food) => {
      if (food.alcoholic === true || food.countedInTotals === false) return false;
      if (food.parentId) {
        const parent = byId.get(food.parentId);
        if (parent?.countedInTotals === true) return false;
      }
      if (food.id && parentIds.has(food.id) && food.countedInTotals !== true) return false;
      return true;
    });
  });
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

  // A repeated food key cannot inflate the score. Variety remains based on
  // distinct foods, broad groups, and meal slots; portions weight the
  // composition dimensions below, not the number of distinct foods.
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

function foodQualitySignal(food: ConfirmedMealFood) {
  // undefined means the dimension was not observed; [] means it was observed
  // and no listed property was found.
  if (food.qualityProperties === undefined) return null;
  const properties = food.qualityProperties;
  const explicitSignal = properties.reduce((sum, property) => sum + (qualityPropertyWeights[property] ?? 0), 0);
  return clamp(explicitSignal, 0, 1);
}

function qualityComponent(day: MealDailyAggregate, foods: readonly ConfirmedMealFood[], confidence: number, observationCoverage: number): ComponentInput {
  const observed = foods.filter(qualityObservation);
  if (!observed.length) return { ...emptyComponent("foodQuality"), observationCoverage: 0 };
  const signals = observed.map(foodQualitySignal).filter((value): value is number => value !== null);
  const labelCoverage = foodCoverage(day, foods, "qualityProperties", qualityObservation);
  return {
    key: "foodQuality",
    label: componentLabels.foodQuality,
    score: score(50 + (weightedAverage(observed, foodQualitySignal, foodWeight) ?? average(signals) ?? 0) * 50),
    confidence: confidenceForAxis(foods, observed, "qualityProperties", confidence),
    observedValue: `${Math.round(labelCoverage * 100)}% des aliments avec propriétés décrites`,
    target: "Favoriser les propriétés qualitatives observées",
    summary: "Les propriétés disponibles décrivent les aliments ; leur absence n'est pas interprétée comme une mauvaise qualité.",
    observationCoverage: observationCoverage * labelCoverage,
  };
}

function addedSugarScore(addedSugarG: number) {
  if (addedSugarG <= 0) return 100;
  if (addedSugarG <= 5) return 100 - addedSugarG * 3;
  // The tolerance is intentionally short: after 5 g, each extra amount has
  // a visibly stronger effect instead of keeping most days in the 70–80 band.
  return 85 * Math.pow(5 / addedSugarG, 1.1);
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
    summary: value === 0 ? "Aucun sucre ajouté observé ; le sucre d'un fruit entier n'est pas pénalisé ici." : "La pénalité augmente après la tolérance de 5 g, sans confondre sucre ajouté et sucre naturellement présent. La couverture reflète uniquement les repas où ce champ est renseigné.",
    observationCoverage,
  };
}

/**
 * A liquid is not automatically a sugar exposure. The provider's explicit
 * concentrated flag is a sugar signal; otherwise only an existing sweet/sugar
 * food-group label can turn the liquid flag into a penalty.
 */
function sugarExposureFlags(food: ConfirmedMealFood) {
  const exposure = food.sugarExposure;
  const groupSignals = (food.foodGroups ?? []).some((group) => /sweet|sugar|juice|dessert/i.test(group));
  return {
    liquid: exposure?.liquid === true && (exposure.concentrated === true || groupSignals),
    concentrated: exposure?.concentrated === true,
  };
}

function sugarExposureComponent(day: MealDailyAggregate, foods: readonly ConfirmedMealFood[], confidence: number, observationCoverage: number): ComponentInput {
  const labelled = foods.filter(sugarExposureObservation);
  if (!labelled.length) return { ...emptyComponent("sugarExposure"), observationCoverage: 0 };
  const labelCoverage = foodCoverage(day, foods, "sugarExposure", sugarExposureObservation);
  const liquidShare = weightedShare(labelled, (food) => sugarExposureFlags(food).liquid) ?? 0;
  const concentratedShare = weightedShare(labelled, (food) => sugarExposureFlags(food).concentrated) ?? 0;
  const liquidCount = labelled.filter((food) => sugarExposureFlags(food).liquid).length;
  const concentratedCount = labelled.filter((food) => sugarExposureFlags(food).concentrated).length;
  return {
    key: "sugarExposure",
    label: componentLabels.sugarExposure,
    score: score(100 - 50 * liquidShare - 50 * concentratedShare),
    confidence: confidenceForAxis(foods, labelled, "sugarExposure", confidence),
    observedValue: `${liquidCount} liquide · ${concentratedCount} concentré`,
    target: "Limiter les expositions liquides et concentrées",
    summary: "Seules les expositions avec un signal sucré sont pénalisées ; eau, lait, café et sauce soja ne le sont pas par leur forme liquide seule.",
    observationCoverage: observationCoverage * labelCoverage,
  };
}

function ultraProcessingComponent(day: MealDailyAggregate, foods: readonly ConfirmedMealFood[], confidence: number, observationCoverage: number): ComponentInput {
  const labelled = foods.filter(novaObservation);
  if (!labelled.length) return { ...emptyComponent("ultraProcessing"), observationCoverage: 0 };
  const labelCoverage = foodCoverage(day, foods, "novaGroup", novaObservation);
  const points = { 1: 100, 2: 70, 3: 35, 4: 5 } as const;
  const averageNovaScore = weightedAverage(labelled, (food) => points[food.novaGroup as 1 | 2 | 3 | 4], foodWeight) ?? 0;
  const group4Count = labelled.filter((food) => food.novaGroup === 4).length;
  return {
    key: "ultraProcessing",
    label: componentLabels.ultraProcessing,
    score: score(averageNovaScore),
    confidence: confidenceForAxis(foods, labelled, "novaGroup", confidence),
    observedValue: unit(weightedAverage(labelled, (food) => food.novaGroup ?? null, foodWeight) ?? 0),
    target: "Privilégier les groupes NOVA 1–3 lorsque l'information existe",
    summary: `${group4Count} aliment${group4Count > 1 ? "s" : ""} NOVA 4 observé${group4Count > 1 ? "s" : ""} ; les aliments sans étiquette restent inconnus.`,
    observationCoverage: observationCoverage * labelCoverage,
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
  /** Fraction of expected meal slots represented by this observation. */
  observationCoverage?: number;
}) {
  const calories = finiteNonNegative(input.caloriesKcal);
  if (calories === null) return null;
  const low = input.targets.caloriesKcal.low;
  const targetHigh = input.targets.caloriesKcal.high;
  const usefulHigh = input.goalMode === "build_muscle"
    ? targetHigh + Math.max(0, finiteNonNegative(input.targets.surplusKcal) ?? 0)
    : targetHigh;
  const fullDayScore = calories >= low && calories <= usefulHigh
    ? 100
    : calories < low
      ? low === 0 ? 100 : score(100 * Math.pow(calories / low, 0.65))
      : score(100 * Math.pow(usefulHigh / calories, 0.8));
  const coverage = clamp(input.observationCoverage ?? (input.partialDay ? 0.5 : 1), 0, 1);
  // A partial day is not a complete intake observation. Bring the energy
  // signal towards neutral in proportion to its observed meal-slot coverage,
  // without inventing a minimum score such as the former 75-point floor.
  const evidence = input.partialDay ? Math.max(0.35, coverage) : coverage;
  return score(50 + (fullDayScore - 50) * evidence);
}

function recordFieldCoverage(day: MealDailyAggregate, records: readonly ConfirmedMealRecord[], read: (record: ConfirmedMealRecord) => NutritionEstimateLike | null | undefined) {
  const meal = mealCoverage(day);
  if (records.length) {
    const observed = records.filter((record) => finiteNonNegative(read(record)?.likely) !== null).length / records.length;
    return meal * observed;
  }
  return meal;
}

type NutritionEstimateLike = { likely: number };

function addedSugarObservationCoverage(day: MealDailyAggregate, records: readonly ConfirmedMealRecord[]) {
  if (records.length) return recordFieldCoverage(day, records, (record) => record.addedSugarG);
  return day.addedSugarG === null ? 0 : mealCoverage(day);
}

function energyObservationCoverage(day: MealDailyAggregate, records: readonly ConfirmedMealRecord[]) {
  if (records.length) return recordFieldCoverage(day, records, (record) => record.caloriesKcal);
  return day.caloriesKcal === null ? 0 : mealCoverage(day);
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
    score: scoreEnergyForMealBalance({ caloriesKcal: value, targets, goalMode, partialDay: observationCoverage < 0.75, observationCoverage }),
    confidence,
    observedValue: unit(value),
    target: `${targets.caloriesKcal.low}–${usefulHigh} kcal selon la cible existante${goalMode === "build_muscle" ? " et le surplus configuré" : ""}`,
    summary: "La zone utile est un plateau ; les écarts faibles sont graduels et une journée partielle reste distinguée par sa couverture plutôt que par un plancher artificiel.",
    observationCoverage,
  };
}

const mealRiskNovaPenalty = { 1: 0, 2: 30, 3: 65, 4: 100 } as const;

function adverseSignal(key: MealBalanceAdverseSignalKey, label: string, risk: number, confidence: number): MealBalanceAdverseSignal {
  const boundedRisk = score(risk);
  const boundedConfidence = clamp(confidence, 0, 1);
  return {
    key,
    label,
    risk: boundedRisk,
    weightedRisk: score(boundedRisk * boundedConfidence),
    confidence: unit(boundedConfidence),
  };
}

function mealRiskSignals(record: ConfirmedMealRecord): MealBalanceAdverseSignal[] {
  // Keep the alcohol observation separate and intentionally inspect the raw
  // food list before `foodsForRecords` removes alcoholic items from nutrition
  // and food-quality dimensions.
  const rawFoods = record.foods ?? [];
  const foods = foodsForRecords([record]);
  const recordEvidence = recordConfidence([record], 0.5);
  const signals: MealBalanceAdverseSignal[] = [];
  const addedSugar = finiteNonNegative(record.addedSugarG?.likely);
  if (addedSugar !== null) {
    const risk = score(100 - addedSugarScore(addedSugar));
    if (risk > 0) signals.push(adverseSignal("addedSugar", "Sucre ajouté", risk, recordEvidence));
  }

  const labelledExposure = foods.filter(sugarExposureObservation);
  if (labelledExposure.length) {
    const liquidShare = weightedShare(labelledExposure, (food) => sugarExposureFlags(food).liquid) ?? 0;
    const concentratedShare = weightedShare(labelledExposure, (food) => sugarExposureFlags(food).concentrated) ?? 0;
    const risk = score(100 * (0.6 * liquidShare + 0.6 * concentratedShare));
    const confidence = confidenceForAxis(foods, labelledExposure, "sugarExposure", recordEvidence);
    if (risk > 0) signals.push(adverseSignal("sugarExposure", "Exposition sucrée", risk, confidence));
  }

  const labelledNova = foods.filter(novaObservation);
  const novaRisk = weightedAverage(labelledNova, (food) => mealRiskNovaPenalty[food.novaGroup as 1 | 2 | 3 | 4], foodWeight);
  if (novaRisk !== null && novaRisk > 0) {
    signals.push(adverseSignal("ultraProcessing", "NOVA défavorable", novaRisk, confidenceForAxis(foods, labelledNova, "novaGroup", recordEvidence)));
  }

  const alcoholicFoods = rawFoods.filter((food) => food.alcoholic === true);
  const alcoholShare = weightedShare(rawFoods, (food) => food.alcoholic === true) ?? 0;
  if (alcoholicFoods.length && alcoholShare > 0) {
    signals.push(adverseSignal("alcohol", "Alcool signalé", alcoholShare * 100, foodConfidence(alcoholicFoods, recordEvidence)));
  }

  return signals;
}

function mealRiskAssessment(record: ConfirmedMealRecord): MealBalanceWorstMeal | null {
  const signals = mealRiskSignals(record);
  if (!signals.length) return null;

  // Correlated NOVA4, exposure and added-sugar signals are folded into one
  // bounded meal-level risk so the same bad meal is not counted three times in
  // the extra penalty. Each signal has already been confidence-weighted.
  const strongest = Math.max(...signals.map((signal) => signal.weightedRisk));
  const remainder = signals.reduce((sum, signal) => sum + signal.weightedRisk, 0) - strongest;
  const severity = score(strongest + 0.3 * remainder);
  const penalty = unit(Math.min(MEAL_BALANCE_ADVERSE_PENALTY_CAP, severity * 0.25));
  const confidence = signals.length
    ? unit(signals.reduce((sum, signal) => sum + signal.confidence, 0) / signals.length)
    : 0;
  return {
    mealId: record.id,
    type: record.mealType,
    penalty,
    signals,
    confidence,
    observationStatus: confidence >= 0.75 ? "ready" : "limited",
  };
}

function worstMealAssessment(records: readonly ConfirmedMealRecord[]) {
  const candidates = records.map(mealRiskAssessment).filter((meal): meal is MealBalanceWorstMeal => meal !== null);
  if (!candidates.length) return null;
  return [...candidates].sort((first, second) => second.penalty - first.penalty || first.mealId.localeCompare(second.mealId))[0] ?? null;
}

function effectForComponent(component: MealBalanceComponent): MealBalanceEffect | null {
  if (component.score === null) return null;
  if (component.weight <= 0) return null;
  const distance = Math.abs(component.score - 50);
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
    baseScore: null,
    adversePenalty: 0,
    worstMeal: null,
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
  const mealObservationCoverage = mealCoverage(day);
  const nutritionObservationCoverage = baseObservationCoverage(day, analysis);
  const dayConfidence = day.analysisConfidence !== null && Number.isFinite(day.analysisConfidence)
    ? clamp(day.analysisConfidence, 0, 100) / 100
    : 0.5;
  const globalConfidence = recordConfidence(records, dayConfidence);
  const foodConfidenceValue = foodConfidence(foods, globalConfidence);
  const foodListObservationCoverage = records.length
    ? mealObservationCoverage * (day.foodListCoverage ?? 1)
    : day.foodVarietyCount !== null ? Math.min(mealObservationCoverage * (day.foodListCoverage ?? 1), 0.5) : 0;
  // `day.foodObservationCoverage` already includes foodListCoverage for each
  // labelled axis. Keep the base at meal coverage here so quality, sugar
  // exposure and NOVA do not discount missing food lists a second time.
  const foodAxisObservationCoverage = records.length ? mealObservationCoverage : foodListObservationCoverage;
  const addedSugarCoverage = addedSugarObservationCoverage(day, records);
  const energyCoverage = energyObservationCoverage(day, records);

  const rawComponents: ComponentInput[] = [
    varietyComponent(day, foods, foodConfidenceValue, foodListObservationCoverage),
    qualityComponent(day, foods, foodConfidenceValue, foodAxisObservationCoverage),
    addedSugarComponent(day, globalConfidence, addedSugarCoverage),
    sugarExposureComponent(day, foods, foodConfidenceValue, foodAxisObservationCoverage),
    ultraProcessingComponent(day, foods, foodConfidenceValue, foodAxisObservationCoverage),
    nutritionCoverageComponent(day, globalConfidence, nutritionObservationCoverage),
    energyComponent(day, input.targets, goalMode, globalConfidence, energyCoverage),
  ];
  const components = rawComponents.map(createComponent);
  const behaviouralComponents = components.filter((component) => component.weight > 0);
  const hasObservedBehaviour = behaviouralComponents.some((component) => component.score !== null && component.observationCoverage > 0);
  // Fixed behavioural weights keep unknown dimensions neutral at 50 instead
  // of renormalising the day around whichever axes happened to be available.
  // Each component exposes its rounded adjustment, so this same expression is
  // reconstructible from the public contract and remains stable in the UI.
  const componentAdjustment = behaviouralComponents.reduce((sum, component) => sum + component.contribution, 0);
  const baseScore = hasObservedBehaviour ? score(MEAL_BALANCE_NEUTRAL_BASE + componentAdjustment) : null;
  const nominalObservedWeight = behaviouralComponents.reduce((sum, component) => sum + (component.score === null ? 0 : component.weight * component.observationCoverage), 0);
  const confidence = nominalObservedWeight ? unit(behaviouralComponents.reduce((sum, component) => sum + (component.score === null ? 0 : component.weight * component.confidence * component.observationCoverage), 0) / nominalObservedWeight) : 0;
  const coverage = unit(behaviouralComponents.reduce((sum, component) => sum + component.weight * (component.score === null ? 0 : component.observationCoverage), 0) / MEAL_BALANCE_WEIGHT_TOTAL);
  const worstMeal = hasObservedBehaviour ? worstMealAssessment(records) : null;
  const penalty = worstMeal?.penalty ?? 0;
  const calculatedScore = baseScore === null ? null : score(baseScore - penalty);
  const status: MealBalanceStatus = calculatedScore === null ? "insufficient" : coverage >= 0.75 && confidence >= 0.75 ? "ready" : "limited";
  const baseStrongestEffects = components
    .map(effectForComponent)
    .filter((effect): effect is MealBalanceEffect => effect !== null)
    .sort((first, second) => {
      const directionRank = { negative: 0, caution: 1, positive: 2 } as const;
      return directionRank[first.direction] - directionRank[second.direction]
        || Math.abs(second.points - 50) - Math.abs(first.points - 50);
    })
    .slice(0, 3);
  const riskReason = penalty > 0 ? `Repas le plus défavorable : -${unit(penalty)} point${penalty > 1 ? "s" : ""} après combinaison des signaux corrélés.` : null;
  // Keep the bounded internal penalty in its own contract/UI field instead of
  // pretending it is another /100 component or duplicating it in an effect.
  const strongestEffects = baseStrongestEffects;

  return {
    algorithmVersion: MEAL_BALANCE_ALGORITHM_VERSION,
    score: calculatedScore,
    status,
    coverage,
    confidence,
    components,
    strongestEffects,
    reasons: [
      ...strongestEffects.map((effect) => `${effect.label} : ${effect.summary}`),
      ...(riskReason ? [riskReason] : []),
    ],
    baseScore,
    adversePenalty: penalty,
    worstMeal,
  };
}
