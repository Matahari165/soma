export type NutritionTargetRange = {
  low: number;
  likely: number;
  high: number;
};

export type NutritionTargets = {
  caloriesKcal: NutritionTargetRange;
  proteinG: NutritionTargetRange;
  fatG: NutritionTargetRange;
  carbsG: NutritionTargetRange;
  fiberG: NutritionTargetRange;
  surplusKcal: number;
};

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
  const surplusKcal = typeof input.surplusKcal === "number" && Number.isFinite(input.surplusKcal) ? input.surplusKcal : null;
  if (!caloriesKcal || !proteinG || !fatG || !carbsG || !fiberG || surplusKcal === null) return null;
  return { caloriesKcal, proteinG, fatG, carbsG, fiberG, surplusKcal };
}

export const NUTRITION_TARGETS_STORAGE_KEY = "soma.nutrition-targets.v1";

export const DEFAULT_NUTRITION_TARGETS: NutritionTargets = {
  caloriesKcal: { low: 2900, likely: 3000, high: 3100 },
  proteinG: { low: 150, likely: 160, high: 170 },
  fatG: { low: 70, likely: 80, high: 90 },
  carbsG: { low: 350, likely: 385, high: 420 },
  fiberG: { low: 25, likely: 30, high: 35 },
  surplusKcal: 300,
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
