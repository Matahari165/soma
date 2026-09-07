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
      storageStatus: photo.storageStatus ?? "available",
      purgedAt: photo.purgedAt ?? null,
      url: `/api/meals/${encodeURIComponent(meal.id)}/photos/${encodeURIComponent(photo.id)}`,
    })),
    analysis: meal.analysis,
    lastSuccessfulAnalysis: meal.lastSuccessfulAnalysis ?? null,
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
    const sugar = legacyRange(item.sugarGrams as { low?: unknown; likely?: unknown; high?: unknown } | null);
    const addedSugar = legacyRange(item.addedSugarGrams as { low?: unknown; likely?: unknown; high?: unknown } | null);
    return [{ name, preparation: null, portion: typeof item.portion === "string" ? item.portion.trim() || null : null, estimatedGrams: null, kind: item.kind === "dish" || item.kind === "component" || item.kind === "ingredient" ? item.kind : undefined, parentId: typeof item.parentId === "string" ? item.parentId : null, course: item.course === "starter" || item.course === "main" || item.course === "side" || item.course === "dessert" ? item.course : null, calories: null, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null, sugarGrams: sugar === "invalid" ? null : sugar, addedSugarGrams: addedSugar === "invalid" ? null : addedSugar, confidence: item.confidence === "high" || item.confidence === "medium" ? item.confidence : "low" } satisfies MealAnalysis["foods"][number]];
  });
  const range = (inputValue: unknown) => legacyRange(inputValue as { low?: unknown; high?: unknown } | null);
  const calories = range(input.calories);
  const proteinGrams = range(input.proteinGrams);
  const carbohydrateGrams = range(input.carbohydratesGrams);
  const fatGrams = range(input.fatGrams);
  const fiberGrams = range(input.fiberGrams);
  const sugarGrams = range(input.sugarGrams);
  const addedSugarGrams = range(input.addedSugarGrams);
  const ranges = [calories, proteinGrams, carbohydrateGrams, fatGrams, fiberGrams, sugarGrams, addedSugarGrams];
  if (ranges.some((value) => value === "invalid")) return null;
  const [validCalories, validProteinGrams, validCarbohydrateGrams, validFatGrams, validFiberGrams, validSugarGrams, validAddedSugarGrams] = ranges as Array<LegacyRange | null>;
  return {
    summary: typeof input.note === "string" && input.note.trim() ? input.note.trim() : "Composition du repas relue par l’utilisateur.",
    dishType: null,
    calorieAnalysis: null,
    foods,
    totals: { calories: validCalories, proteinGrams: validProteinGrams, carbohydrateGrams: validCarbohydrateGrams, fatGrams: validFatGrams, fiberGrams: validFiberGrams, sugarGrams: validSugarGrams, addedSugarGrams: validAddedSugarGrams },
    confidence: input.confidence === "high" || input.confidence === "medium" ? input.confidence : "low",
    uncertainties: [],
  };
}

function legacyRangeFromCanonical(value: { low: number; likely: number; high: number } | null | undefined) {
  return value ? { low: value.low, likely: value.likely, high: value.high } : { low: null, likely: null, high: null };
}

export function mealToLegacyApi(meal: Meal) {
  // A failed retry must not erase the last usable Grok result from the
  // legacy contract. Keep the failure separately visible through `error`.
  const analysisRecord = meal.analysis?.result ? meal.analysis : meal.lastSuccessfulAnalysis;
  const analysis = analysisRecord?.result;
  const legacyAnalysis = analysis ? {
    ingredients: analysis.foods.map((food, index) => ({ id: `${analysisRecord?.id ?? meal.id}-${index}`, name: food.name, portion: food.portion ?? "", confidence: food.confidence, kind: food.kind, parentId: food.parentId ?? null, course: food.course ?? null, countedInTotals: food.countedInTotals, foodGroups: food.foodGroups, varietyKey: food.varietyKey ?? null, evidence: food.evidence, evidenceSource: food.evidenceSource, evidencePhotoIds: food.evidencePhotoIds, quantity: food.quantity, preparation: food.preparation, estimatedGrams: food.estimatedGrams, sugarGrams: legacyRangeFromCanonical(food.sugarGrams), addedSugarGrams: legacyRangeFromCanonical(food.addedSugarGrams) })),
    dishType: analysis.dishType ?? null,
    calorieAnalysis: analysis.calorieAnalysis ?? null,
    calories: legacyRangeFromCanonical(analysis.totals.calories),
    proteinGrams: legacyRangeFromCanonical(analysis.totals.proteinGrams),
    carbohydratesGrams: legacyRangeFromCanonical(analysis.totals.carbohydrateGrams),
    fatGrams: legacyRangeFromCanonical(analysis.totals.fatGrams),
    fiberGrams: legacyRangeFromCanonical(analysis.totals.fiberGrams),
    sugarGrams: legacyRangeFromCanonical(analysis.totals.sugarGrams),
    addedSugarGrams: legacyRangeFromCanonical(analysis.totals.addedSugarGrams),
    confidence: analysis.confidence,
    note: analysis.calorieAnalysis ?? analysis.summary,
  } : null;
  return {
    id: meal.id,
    date: meal.mealDate,
    slot: meal.mealType,
    photos: meal.photos.map((photo) => ({ id: photo.id, url: `/api/meals/${encodeURIComponent(meal.id)}/photos/${encodeURIComponent(photo.id)}`, filename: photo.filename ?? undefined, origin: photo.origin, storageStatus: photo.storageStatus ?? "available", purgedAt: photo.purgedAt ?? null })),
    analysis: legacyAnalysis,
    mouthHeat: meal.mouthWarmthIntensity,
    stomachLoad: meal.stomachOverfullIntensity,
    status: meal.status === "confirmed" ? "confirmed" : meal.analysis?.status === "failed" ? "error" : meal.analysis?.status === "completed" ? "review" : meal.lastSuccessfulAnalysis ? "review" : "draft",
    error: meal.analysis?.error ?? null,
    errorCode: meal.analysis?.errorCode ?? null,
    confirmedAt: meal.status === "confirmed" ? meal.updatedAt : null,
  };
}
