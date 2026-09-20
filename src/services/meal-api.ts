import {
  mealAnalysisSchema,
  mealFoodObservationSchema,
  mealNovaGroupSchema,
  mealQualityPropertySchema,
  mealQuantitySchema,
  mealSugarExposureSchema,
  mealUncertaintySignalSchema,
  type Meal,
  type MealAnalysis,
  type MealEntryState,
} from "@/domain/meals";

function entryStateForApi(meal: Meal): MealEntryState {
  return meal.entryState === "skipped" ? "skipped" : "recorded";
}

function analysisRecordToApi(record: Meal["analysis"] | undefined) {
  if (!record) return record ?? null;
  return { ...record, result: legacyAnalysisToStructured(record.result) };
}

export function mealToApi(meal: Meal) {
  return {
    id: meal.id,
    mealDate: meal.mealDate,
    mealType: meal.mealType,
    note: meal.note,
    status: meal.status,
    entryState: entryStateForApi(meal),
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
      comment: photo.comment ?? null,
      createdAt: photo.createdAt,
      storageStatus: photo.storageStatus ?? "available",
      purgedAt: photo.purgedAt ?? null,
      // A confirmed meal is the privacy boundary: even if a legacy row still
      // says `available` after an interrupted purge, never expose an image URL.
      url: meal.status !== "confirmed" && (photo.storageStatus ?? "available") === "available"
        ? `/api/meals/${encodeURIComponent(meal.id)}/photos/${encodeURIComponent(photo.id)}`
        : null,
    })),
    analysis: analysisRecordToApi(meal.analysis),
    lastSuccessfulAnalysis: analysisRecordToApi(meal.lastSuccessfulAnalysis),
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

function legacyFoodObservation(value: unknown) {
  const parsed = mealFoodObservationSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function legacySugarExposure(value: unknown) {
  if (value === null) return null;
  const parsed = mealSugarExposureSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function legacyQualityProperties(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((property) => {
    const parsed = mealQualityPropertySchema.safeParse(property);
    return parsed.success ? [parsed.data] : [];
  }).slice(0, 8);
}

function legacyUncertaintySignals(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((signal) => {
    const parsed = mealUncertaintySignalSchema.safeParse(signal);
    return parsed.success ? [parsed.data] : [];
  }).slice(0, 20);
}

function legacyUncertainties(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 12);
}

/** Convert the first UI contract to the canonical stored analysis shape. */
export function legacyAnalysisToStructured(value: unknown): MealAnalysis | null {
  const canonical = mealAnalysisSchema.safeParse(value);
  if (canonical.success) return canonical.data;
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const rawIngredients = Array.isArray(input.ingredients) ? input.ingredients : [];
  const rawIngredientRecords = rawIngredients.filter(
    (ingredient): ingredient is Record<string, unknown> => Boolean(ingredient && typeof ingredient === "object"),
  );
  const rawIngredientIds = rawIngredientRecords.flatMap((item) =>
    typeof item.id === "string" && item.id.trim() ? [item.id.trim().slice(0, 120)] : [],
  );
  const canPreserveIds =
    rawIngredientRecords.length === rawIngredients.length &&
    rawIngredientIds.length === rawIngredientRecords.length &&
    new Set(rawIngredientIds).size === rawIngredientIds.length &&
    rawIngredientRecords.every(
      (item) => item.parentId === null || item.parentId === undefined ||
        (typeof item.parentId === "string" && rawIngredientIds.includes(item.parentId)),
    );
  const foods = rawIngredients.flatMap((ingredient) => {
    if (!ingredient || typeof ingredient !== "object") return [];
    const item = ingredient as Record<string, unknown>;
    const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : null;
    if (!name) return [];
    const sugar = legacyRange(item.sugarGrams as { low?: unknown; likely?: unknown; high?: unknown } | null);
    const addedSugar = legacyRange(item.addedSugarGrams as { low?: unknown; likely?: unknown; high?: unknown } | null);
    const quantity = item.quantity === null ? null : mealQuantitySchema.safeParse(item.quantity);
    const novaGroup = item.novaGroup === null ? null : mealNovaGroupSchema.safeParse(item.novaGroup);
    return [{
      id: canPreserveIds && typeof item.id === "string" && item.id.trim() ? item.id.trim().slice(0, 120) : undefined,
      name,
      preparation: typeof item.preparation === "string" ? item.preparation.trim() || null : null,
      portion: typeof item.portion === "string" ? item.portion.trim() || null : null,
      estimatedGrams: typeof item.estimatedGrams === "number" && Number.isFinite(item.estimatedGrams) ? item.estimatedGrams : null,
      kind: item.kind === "dish" || item.kind === "component" || item.kind === "ingredient" ? item.kind : undefined,
      parentId: typeof item.parentId === "string" ? item.parentId : null,
      course: item.course === "starter" || item.course === "main" || item.course === "side" || item.course === "dessert" ? item.course : null,
      countedInTotals: typeof item.countedInTotals === "boolean" ? item.countedInTotals : undefined,
      alcoholic: typeof item.alcoholic === "boolean" ? item.alcoholic : undefined,
      foodGroups: Array.isArray(item.foodGroups) ? item.foodGroups.filter((group) => typeof group === "string").slice(0, 4) as MealAnalysis["foods"][number]["foodGroups"] : undefined,
      varietyKey: typeof item.varietyKey === "string" && item.varietyKey.trim() ? item.varietyKey.trim().slice(0, 80) : null,
      evidence: item.evidence === "visible" || item.evidence === "inferred" || item.evidence === "unknown" ? item.evidence : undefined,
      evidenceSource: item.evidenceSource === "photo" || item.evidenceSource === "note" || item.evidenceSource === "model" ? item.evidenceSource : undefined,
      evidencePhotoIds: Array.isArray(item.evidencePhotoIds) ? item.evidencePhotoIds.filter((id): id is string => typeof id === "string").slice(0, 5) : undefined,
      quantity: quantity === null ? null : quantity.success ? quantity.data : undefined,
      novaGroup: novaGroup === null ? null : novaGroup.success ? novaGroup.data : undefined,
      sugarExposure: legacySugarExposure(item.sugarExposure),
      qualityProperties: legacyQualityProperties(item.qualityProperties),
      observation: legacyFoodObservation(item.observation),
      calories: null,
      proteinGrams: null,
      carbohydrateGrams: null,
      fatGrams: null,
      fiberGrams: null,
      sugarGrams: sugar === "invalid" ? null : sugar,
      addedSugarGrams: addedSugar === "invalid" ? null : addedSugar,
      confidence: item.confidence === "high" || item.confidence === "medium" ? item.confidence : "low",
    } satisfies MealAnalysis["foods"][number]];
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
  const uncertainties = legacyUncertainties(input.uncertainties);
  return {
    summary: typeof input.note === "string" && input.note.trim() ? input.note.trim() : "Composition du repas relue par l’utilisateur.",
    dishType: null,
    calorieAnalysis: null,
    foods,
    totals: { calories: validCalories, proteinGrams: validProteinGrams, carbohydrateGrams: validCarbohydrateGrams, fatGrams: validFatGrams, fiberGrams: validFiberGrams, sugarGrams: validSugarGrams, addedSugarGrams: validAddedSugarGrams },
    confidence: input.confidence === "high" || input.confidence === "medium" ? input.confidence : "low",
    uncertainties,
    uncertaintySignals: legacyUncertaintySignals(input.uncertaintySignals),
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
    ingredients: analysis.foods.map((food) => ({ id: food.id, name: food.name, portion: food.portion ?? "", confidence: food.confidence, kind: food.kind, parentId: food.parentId ?? null, course: food.course ?? null, countedInTotals: food.countedInTotals, foodGroups: food.foodGroups, varietyKey: food.varietyKey ?? null, alcoholic: food.alcoholic, novaGroup: food.novaGroup, sugarExposure: food.sugarExposure, qualityProperties: food.qualityProperties, observation: food.observation, evidence: food.evidence, evidenceSource: food.evidenceSource, evidencePhotoIds: food.evidencePhotoIds, quantity: food.quantity, preparation: food.preparation, estimatedGrams: food.estimatedGrams, sugarGrams: legacyRangeFromCanonical(food.sugarGrams), addedSugarGrams: legacyRangeFromCanonical(food.addedSugarGrams) })),
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
    uncertainties: analysis.uncertainties,
    uncertaintySignals: analysis.uncertaintySignals,
  } : null;
  return {
    id: meal.id,
    date: meal.mealDate,
    slot: meal.mealType,
    note: meal.note,
    photos: meal.photos.map((photo) => ({ id: photo.id, url: meal.status !== "confirmed" && (photo.storageStatus ?? "available") === "available" ? `/api/meals/${encodeURIComponent(meal.id)}/photos/${encodeURIComponent(photo.id)}` : null, filename: photo.filename ?? undefined, origin: photo.origin, storageStatus: photo.storageStatus ?? "available", purgedAt: photo.purgedAt ?? null })),
    analysis: legacyAnalysis,
    mouthHeat: meal.mouthWarmthIntensity,
    stomachLoad: meal.stomachOverfullIntensity,
    status: meal.status === "confirmed" ? "confirmed" : meal.analysis?.status === "queued" || meal.analysis?.status === "running" ? "analyzing" : meal.analysis?.status === "failed" ? "error" : meal.analysis?.status === "completed" ? "review" : meal.lastSuccessfulAnalysis ? "review" : "draft",
    entryState: entryStateForApi(meal),
    analysisStatus: meal.analysis?.status ?? null,
    error: meal.analysis?.error ?? null,
    errorCode: meal.analysis?.errorCode ?? null,
    confirmedAt: meal.status === "confirmed" ? meal.updatedAt : null,
  };
}
