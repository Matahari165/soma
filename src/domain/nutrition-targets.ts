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

export const NUTRITION_TARGETS_STORAGE_KEY = "soma.nutrition-targets.v1";

export const DEFAULT_NUTRITION_TARGETS: NutritionTargets = {
  caloriesKcal: { low: 2900, likely: 3000, high: 3100 },
  proteinG: { low: 150, likely: 160, high: 170 },
  fatG: { low: 70, likely: 80, high: 90 },
  carbsG: { low: 350, likely: 385, high: 420 },
  fiberG: { low: 25, likely: 30, high: 35 },
  surplusKcal: 300,
};

function isValidRange(value: unknown): value is NutritionTargetRange {
  if (!value || typeof value !== "object") return false;
  const range = value as Record<string, unknown>;
  return (
    typeof range.low === "number" &&
    Number.isFinite(range.low) &&
    typeof range.likely === "number" &&
    Number.isFinite(range.likely) &&
    typeof range.high === "number" &&
    Number.isFinite(range.high)
  );
}

function isValidTargets(value: unknown): value is NutritionTargets {
  if (!value || typeof value !== "object") return false;
  const targets = value as Record<string, unknown>;
  return (
    isValidRange(targets.caloriesKcal) &&
    isValidRange(targets.proteinG) &&
    isValidRange(targets.fatG) &&
    isValidRange(targets.carbsG) &&
    isValidRange(targets.fiberG) &&
    typeof targets.surplusKcal === "number" &&
    Number.isFinite(targets.surplusKcal)
  );
}

export function loadNutritionTargets(): NutritionTargets {
  try {
    if (typeof localStorage === "undefined") return DEFAULT_NUTRITION_TARGETS;
    const raw = localStorage.getItem(NUTRITION_TARGETS_STORAGE_KEY);
    if (!raw) return DEFAULT_NUTRITION_TARGETS;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidTargets(parsed)) return DEFAULT_NUTRITION_TARGETS;
    return parsed;
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
