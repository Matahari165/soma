export type NutritionTargetRange = {
  low: number;
  likely: number;
  high: number;
};

export const DEFAULT_EFFORT_THRESHOLD = 40;
export const EFFORT_TARGET_MIN_COVERAGE = 0.75;
export const EFFORT_KCAL_PER_POINT = 10;
export const EFFORT_TARGET_STEP_KCAL = 50;
export const EFFORT_TARGET_MAX_SURPLUS_KCAL = 300;

export type EffortTargetContext = {
  effortScore: number | null;
  effortCoverage: number | null;
  averageEffortScore: number | null;
};

export type EffortTargetAdjustment = {
  threshold: number;
  supplementKcal: number;
  applied: boolean;
};

export const DEFAULT_ADDED_SUGAR_TARGET: NutritionTargetRange = { low: 0, likely: 0, high: 5 };

export type MealTargetSlot = "breakfast" | "lunch" | "snack" | "dinner";
export type MealTargetDistribution = Record<MealTargetSlot, number>;

export const MEAL_TARGET_SLOTS: readonly MealTargetSlot[] = ["breakfast", "lunch", "snack", "dinner"];

/**
 * Main meals receive the default daily split. A snack is optional and starts
 * outside the split until the user assigns it a share explicitly.
 */
export const DEFAULT_MEAL_TARGET_DISTRIBUTION: MealTargetDistribution = {
  breakfast: 25,
  lunch: 40,
  snack: 0,
  dinner: 35,
};

export type NutritionTargets = {
  caloriesKcal: NutritionTargetRange;
  proteinG: NutritionTargetRange;
  fatG: NutritionTargetRange;
  carbsG: NutritionTargetRange;
  fiberG: NutritionTargetRange;
  /** Personal guardrail: ideal 0 g, with a 5 g/day tolerance. */
  addedSugarG: NutritionTargetRange;
  surplusKcal: number;
  /** Optional for backwards compatibility with targets saved before meal splits. */
  mealDistribution?: MealTargetDistribution;
};

function finiteScore(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

function finiteCoverage(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

export function effortThreshold(averageEffortScore: number | null): number {
  return finiteScore(averageEffortScore) ?? DEFAULT_EFFORT_THRESHOLD;
}

export function effortTargetAdjustment(context: EffortTargetContext): EffortTargetAdjustment {
  const score = finiteScore(context.effortScore);
  const coverage = finiteCoverage(context.effortCoverage);
  const threshold = effortThreshold(context.averageEffortScore);
  const applied = score !== null && coverage !== null && coverage >= EFFORT_TARGET_MIN_COVERAGE;
  if (!applied) return { threshold, supplementKcal: 0, applied: false };

  const rawSupplement = Math.min(
    EFFORT_TARGET_MAX_SURPLUS_KCAL,
    Math.max(0, (score - threshold) * EFFORT_KCAL_PER_POINT),
  );
  const supplementKcal = Math.min(
    EFFORT_TARGET_MAX_SURPLUS_KCAL,
    Math.max(0, Math.round(rawSupplement / EFFORT_TARGET_STEP_KCAL) * EFFORT_TARGET_STEP_KCAL),
  );
  return { threshold, supplementKcal, applied: true };
}

export function nutritionTargetsForEffort(baseTargets: NutritionTargets, context: EffortTargetContext): NutritionTargets {
  const { supplementKcal } = effortTargetAdjustment(context);
  if (supplementKcal === 0) return baseTargets;
  return {
    ...baseTargets,
    caloriesKcal: {
      low: baseTargets.caloriesKcal.low + supplementKcal,
      likely: baseTargets.caloriesKcal.likely + supplementKcal,
      high: baseTargets.caloriesKcal.high + supplementKcal,
    },
  };
}

export function mealTargetDistributionOf(targets: NutritionTargets): MealTargetDistribution {
  return targets.mealDistribution ?? DEFAULT_MEAL_TARGET_DISTRIBUTION;
}

export function mealTargetForRange(range: NutritionTargetRange, slot: MealTargetSlot, targets: NutritionTargets): number | null {
  const share = mealTargetDistributionOf(targets)[slot];
  if (!Number.isFinite(share) || share <= 0) return null;
  const reference = range.likely > 0 ? range.likely : range.high;
  if (!Number.isFinite(reference) || reference <= 0) return null;
  return reference * (share / 100);
}

/**
 * Keep a same-day target from moving down when a partial activity refresh
 * temporarily reports less effort. A changed base target remains authoritative
 * so a deliberate edit is reflected immediately.
 */
export function mergeDailyNutritionTargets(input: {
  current: NutritionTargets;
  next: NutritionTargets;
  sameDay: boolean;
  baseUnchanged: boolean;
}): NutritionTargets {
  if (
    input.sameDay
    && input.baseUnchanged
    && input.next.caloriesKcal.likely < input.current.caloriesKcal.likely
  ) return input.current;
  return input.next;
}

/**
 * Runtime validation shared by the server route and client consumers.
 * Ranges are deliberately ordered so progress and downstream guidance never
 * use an inverted target by accident.
 */
export function parseNutritionTargets(value: unknown): NutritionTargets | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const range = (candidate: unknown): NutritionTargetRange | null => {
    if (!candidate || typeof candidate !== "object") return null;
    const item = candidate as Record<string, unknown>;
    const low = typeof item.low === "number" && Number.isFinite(item.low) && item.low >= 0 ? item.low : null;
    const likely = typeof item.likely === "number" && Number.isFinite(item.likely) && item.likely >= 0 ? item.likely : null;
    const high = typeof item.high === "number" && Number.isFinite(item.high) && item.high >= 0 ? item.high : null;
    if (low === null || likely === null || high === null || low > likely || likely > high) return null;
    return { low, likely, high };
  };
  const caloriesKcal = range(input.caloriesKcal);
  const proteinG = range(input.proteinG);
  const fatG = range(input.fatG);
  const carbsG = range(input.carbsG);
  const fiberG = range(input.fiberG);
  // Older saved targets predate the added-sugar axis. Keep them valid and
  // apply the user's explicit 0 g ideal / 5 g tolerance by default.
  const addedSugarG = range(input.addedSugarG) ?? DEFAULT_ADDED_SUGAR_TARGET;
  const surplusKcal = typeof input.surplusKcal === "number" && Number.isFinite(input.surplusKcal) ? input.surplusKcal : null;
  const rawDistribution = input.mealDistribution;
  let mealDistribution = DEFAULT_MEAL_TARGET_DISTRIBUTION;
  if (rawDistribution !== undefined) {
    if (!rawDistribution || typeof rawDistribution !== "object" || Array.isArray(rawDistribution)) return null;
    const candidate = rawDistribution as Record<string, unknown>;
    const values = MEAL_TARGET_SLOTS.map((slot) => candidate[slot]);
    if (!values.every((item) => typeof item === "number" && Number.isFinite(item) && item >= 0 && item <= 100)) return null;
    const numericValues = values as number[];
    const total = numericValues.reduce((sum, item) => sum + item, 0);
    if (Math.abs(total - 100) > 0.001) return null;
    mealDistribution = Object.fromEntries(MEAL_TARGET_SLOTS.map((slot) => [slot, Number(candidate[slot])])) as MealTargetDistribution;
  }
  if (!caloriesKcal || !proteinG || !fatG || !carbsG || !fiberG || surplusKcal === null) return null;
  return { caloriesKcal, proteinG, fatG, carbsG, fiberG, addedSugarG, surplusKcal, mealDistribution };
}

export const NUTRITION_TARGETS_STORAGE_KEY = "soma.nutrition-targets.v1";

export const DEFAULT_NUTRITION_TARGETS: NutritionTargets = {
  caloriesKcal: { low: 2900, likely: 3000, high: 3100 },
  proteinG: { low: 150, likely: 160, high: 170 },
  fatG: { low: 70, likely: 80, high: 90 },
  carbsG: { low: 350, likely: 385, high: 420 },
  fiberG: { low: 25, likely: 30, high: 35 },
  addedSugarG: DEFAULT_ADDED_SUGAR_TARGET,
  surplusKcal: 300,
  mealDistribution: DEFAULT_MEAL_TARGET_DISTRIBUTION,
};

export function loadNutritionTargets(): NutritionTargets {
  try {
    if (typeof localStorage === "undefined") return DEFAULT_NUTRITION_TARGETS;
    const raw = localStorage.getItem(NUTRITION_TARGETS_STORAGE_KEY);
    if (!raw) return DEFAULT_NUTRITION_TARGETS;
    const parsed: unknown = JSON.parse(raw);
    return parseNutritionTargets(parsed) ?? DEFAULT_NUTRITION_TARGETS;
  } catch {
    return DEFAULT_NUTRITION_TARGETS;
  }
}

export function saveNutritionTargets(targets: NutritionTargets): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(NUTRITION_TARGETS_STORAGE_KEY, JSON.stringify(targets));
  } catch {
    // Stockage local indisponible : on garde les valeurs en mémoire.
  }
}

export function formatTarget(range: NutritionTargetRange): string {
  return `${range.low}–${range.high}`;
}
