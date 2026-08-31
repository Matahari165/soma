import { mealAnalysisSchema, type Meal, type MealAnalysis } from "@/domain/meals";

export function mealToApi(meal: Meal) {
  return {
    id: meal.id,
    mealDate: meal.mealDate,
    mealType: meal.mealType,
    note: meal.note,
    status: meal.status,
    mouthWarmthIntensity: meal.mouthWarmthIntensity,
    stomachOverfullIntensity: meal.stomachOverfullIntensity,
    createdAt: meal.createdAt,
    updatedAt: meal.updatedAt,
    photos: meal.photos.map((photo) => ({
      id: photo.id,
      mealId: photo.mealId,
      origin: photo.origin,
      mimeType: photo.mimeType,
      bytes: photo.bytes,
      filename: photo.filename ?? null,
      createdAt: photo.createdAt,
      url: `/api/meals/${encodeURIComponent(meal.id)}/photos/${encodeURIComponent(photo.id)}`,
    })),
    analysis: meal.analysis,
  };
}

type LegacyRange = { low: number; likely: number; high: number };

function legacyRange(value: { low?: unknown; likely?: unknown; high?: unknown } | null | undefined): LegacyRange | null | "invalid" {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return "invalid";
  const low = typeof value.low === "number" && Number.isFinite(value.low) ? Math.max(0, value.low) : null;
  const likely = typeof value.likely === "number" && Number.isFinite(value.likely) ? Math.max(0, value.likely) : null;
  const high = typeof value.high === "number" && Number.isFinite(value.high) ? Math.max(0, value.high) : null;
  if (low === null && likely === null && high === null) return null;
  if (low === null || likely === null || high === null || low > likely || likely > high) return "invalid";
  return { low, likely, high };
}

/** Convert the first UI contract to the canonical stored analysis shape. */
export function legacyAnalysisToStructured(value: unknown): MealAnalysis | null {
  const canonical = mealAnalysisSchema.safeParse(value);
  if (canonical.success) return canonical.data;
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const rawIngredients = Array.isArray(input.ingredients) ? input.ingredients : [];
  const foods = rawIngredients.flatMap((ingredient) => {
    if (!ingredient || typeof ingredient !== "object") return [];
    const item = ingredient as Record<string, unknown>;
    const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : null;
    if (!name) return [];
    return [{ name, preparation: null, portion: typeof item.portion === "string" ? item.portion.trim() || null : null, estimatedGrams: null, calories: null, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null, confidence: item.confidence === "high" || item.confidence === "medium" ? item.confidence : "low" } satisfies MealAnalysis["foods"][number]];
  });
  const range = (inputValue: unknown) => legacyRange(inputValue as { low?: unknown; high?: unknown } | null);
  const calories = range(input.calories);
  const proteinGrams = range(input.proteinGrams);
  const carbohydrateGrams = range(input.carbohydratesGrams);
  const fatGrams = range(input.fatGrams);
  const fiberGrams = range(input.fiberGrams);
  const ranges = [calories, proteinGrams, carbohydrateGrams, fatGrams, fiberGrams];
  if (ranges.some((value) => value === "invalid")) return null;
  const [validCalories, validProteinGrams, validCarbohydrateGrams, validFatGrams, validFiberGrams] = ranges as Array<LegacyRange | null>;
  return {
    summary: typeof input.note === "string" && input.note.trim() ? input.note.trim() : "Composition du repas relue par l’utilisateur.",
    foods,
    totals: { calories: validCalories, proteinGrams: validProteinGrams, carbohydrateGrams: validCarbohydrateGrams, fatGrams: validFatGrams, fiberGrams: validFiberGrams },
    confidence: input.confidence === "high" || input.confidence === "medium" ? input.confidence : "low",
    uncertainties: [],
  };
}

function legacyRangeFromCanonical(value: { low: number; likely: number; high: number } | null | undefined) {
  return value ? { low: value.low, likely: value.likely, high: value.high } : { low: null, likely: null, high: null };
}

export function mealToLegacyApi(meal: Meal) {
  const analysis = meal.analysis?.result;
  const legacyAnalysis = analysis ? {
    ingredients: analysis.foods.map((food, index) => ({ id: `${meal.analysis?.id ?? meal.id}-${index}`, name: food.name, portion: food.portion ?? "", confidence: food.confidence })),
    calories: legacyRangeFromCanonical(analysis.totals.calories),
    proteinGrams: legacyRangeFromCanonical(analysis.totals.proteinGrams),
    carbohydratesGrams: legacyRangeFromCanonical(analysis.totals.carbohydrateGrams),
    fatGrams: legacyRangeFromCanonical(analysis.totals.fatGrams),
    fiberGrams: legacyRangeFromCanonical(analysis.totals.fiberGrams),
    confidence: analysis.confidence,
    note: analysis.summary,
  } : null;
  return {
    id: meal.id,
    date: meal.mealDate,
    slot: meal.mealType,
    photos: meal.photos.map((photo) => ({ id: photo.id, url: `/api/meals/${encodeURIComponent(meal.id)}/photos/${encodeURIComponent(photo.id)}`, filename: photo.filename ?? undefined, origin: photo.origin })),
    analysis: legacyAnalysis,
    mouthHeat: meal.mouthWarmthIntensity,
    stomachLoad: meal.stomachOverfullIntensity,
    status: meal.status === "confirmed" ? "confirmed" : meal.analysis?.status === "completed" ? "review" : "draft",
    error: meal.analysis?.error ?? null,
    confirmedAt: meal.status === "confirmed" ? meal.updatedAt : null,
  };
}
