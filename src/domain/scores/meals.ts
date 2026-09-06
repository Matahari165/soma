import type { NutritionTargets, NutritionTargetRange } from "@/domain/nutrition-targets";

export type MealNutritionTotals = {
  caloriesKcal: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbsG: number | null;
  fiberG: number | null;
};

type TargetKey = keyof Pick<NutritionTargets, "caloriesKcal" | "proteinG" | "fatG" | "carbsG" | "fiberG">;
type TotalKey = keyof MealNutritionTotals;

const targetComponents: ReadonlyArray<{ totalKey: TotalKey; targetKey: TargetKey; label: string; weight: number }> = [
  { totalKey: "caloriesKcal", targetKey: "caloriesKcal", label: "calories", weight: 35 },
  { totalKey: "proteinG", targetKey: "proteinG", label: "protéines", weight: 25 },
  { totalKey: "fiberG", targetKey: "fiberG", label: "fibres", weight: 15 },
  { totalKey: "carbsG", targetKey: "carbsG", label: "glucides", weight: 15 },
  { totalKey: "fatG", targetKey: "fatG", label: "lipides", weight: 10 },
];

export type MealScoreStatus = "ready" | "limited";

export type MealTargetScore = {
  score: number | null;
  status: MealScoreStatus;
  coverage: number;
  components: Partial<Record<TotalKey, number>>;
  missing: string[];
  algorithmVersion: "meal-target-v1";
};

function clamp(value: number) {
  return Math.round(Math.min(Math.max(value, 0), 100));
}

/**
 * Scores a value against a personal target band. Being inside the band is
 * fully aligned; outside the band, the score decreases proportionally without
 * pretending that one exact target is medically correct.
 */
export function scoreAgainstTarget(value: number | null, target: NutritionTargetRange) {
  if (value === null || !Number.isFinite(value) || value < 0) return null;
  if (value >= target.low && value <= target.high) return 100;
  if (value < target.low) return target.low > 0 ? clamp(value / target.low * 100) : 100;
  return value > 0 ? clamp(target.high / value * 100) : 100;
}

/**
 * A target-alignment score is deliberately withheld when fewer than two
 * dimensions are known. A single estimated nutrient is useful information,
 * but not a reliable global meal-day score.
 */
export function calculateMealTargetScore(input: {
  totals: MealNutritionTotals;
  targets: Pick<NutritionTargets, TargetKey>;
}): MealTargetScore {
  const components: Partial<Record<TotalKey, number>> = {};
  const missing: string[] = [];
  let observedWeight = 0;
  let weightedScore = 0;

  for (const component of targetComponents) {
    const value = input.totals[component.totalKey];
    const score = scoreAgainstTarget(value, input.targets[component.targetKey]);
    if (score === null) {
      missing.push(component.label);
      continue;
    }
    components[component.totalKey] = score;
    observedWeight += component.weight;
    weightedScore += score * component.weight;
  }

  const coverage = observedWeight / 100;
  return {
    score: observedWeight >= 60 ? clamp(weightedScore / observedWeight) : null,
    status: coverage >= 0.75 ? "ready" : "limited",
    coverage,
    components,
    missing,
    algorithmVersion: "meal-target-v1",
  };
}

export type MealEvidenceScore = {
  score: number | null;
  status: MealScoreStatus;
  coverage: number;
  components: {
    mealCoverage: number | null;
    analysisCoverage: number | null;
    analysisConfidence: number | null;
  };
  algorithmVersion: "meal-evidence-v1";
};

/**
 * Separates "how good is the diet" from "how much do we know". This score is
 * only about evidence quality and should never be presented as a health score.
 */
export function calculateMealEvidenceScore(input: MealEvidenceScore["components"]): MealEvidenceScore {
  const components = [
    { key: "mealCoverage" as const, value: input.mealCoverage, weight: 20 },
    { key: "analysisCoverage" as const, value: input.analysisCoverage, weight: 45 },
    { key: "analysisConfidence" as const, value: input.analysisConfidence, weight: 35 },
  ];
  const available = components.filter((component): component is typeof component & { value: number } => component.value !== null && Number.isFinite(component.value));
  const observedWeight = available.reduce((sum, component) => sum + component.weight, 0);
  const score = observedWeight >= 45
    ? clamp(available.reduce((sum, component) => sum + Math.min(Math.max(component.value, 0), 100) * component.weight, 0) / observedWeight)
    : null;
  return {
    score,
    status: observedWeight / 100 >= 0.75 ? "ready" : "limited",
    coverage: observedWeight / 100,
    components: input,
    algorithmVersion: "meal-evidence-v1",
  };
}
