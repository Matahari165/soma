export const MEAL_SLOTS = ["breakfast", "lunch", "snack", "dinner"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];
export type MealOrigin = "homemade" | "prepared" | "mixed";
export type MealStatus = "draft" | "analyzing" | "review" | "confirmed" | "error";
export type Rating = 0 | 1 | 2 | 3 | 4 | 5;

export const MEAL_TOTALS_EVENT = "soma:meal-totals";
export const MEAL_TOTALS_REQUEST_EVENT = "soma:request-meal-totals";
export type MealTotalsEventDetail = {
  date: string;
  isToday: boolean;
  calories: number | null;
  calorieTarget: number | null;
  calorieProgress: number | null;
};

export type MealPhoto = {
  id: string;
  url: string;
  filename?: string;
  origin: MealOrigin | null;
  storageStatus?: "available" | "purge_pending" | "purged";
  purgedAt?: string | null;
};

export type NutritionRange = {
  low: number | null;
  likely?: number | null;
  high: number | null;
};

export type MealFoodKind = "dish" | "component" | "ingredient";
export type MealFoodEvidence = "visible" | "inferred" | "unknown";
export type MealFoodEvidenceSource = "photo" | "note" | "model";
export type MealFoodQuantity = {
  value: number | null;
  unit: string | null;
  basis: string | null;
  grams: number | null;
};

export type MealIngredient = {
  id: string;
  name: string;
  portion: string;
  preparation?: string | null;
  estimatedGrams?: number | null;
  calories?: NutritionRange;
  proteinGrams?: NutritionRange;
  carbohydratesGrams?: NutritionRange;
  fatGrams?: NutritionRange;
  fiberGrams?: NutritionRange;
  sugarGrams?: NutritionRange;
  addedSugarGrams?: NutritionRange;
  confidence?: "low" | "medium" | "high";
  kind?: MealFoodKind;
  parentId?: string | null;
  countedInTotals?: boolean;
  evidence?: MealFoodEvidence;
  evidenceSource?: MealFoodEvidenceSource;
  evidencePhotoIds?: string[];
  quantity?: MealFoodQuantity | null;
};

export type MealAnalysis = {
  ingredients: MealIngredient[];
  summary?: string;
  dishType?: string | null;
  calorieAnalysis?: string | null;
  calories: NutritionRange;
  proteinGrams: NutritionRange;
  carbohydratesGrams?: NutritionRange;
  fatGrams?: NutritionRange;
  fiberGrams?: NutritionRange;
  sugarGrams?: NutritionRange;
  addedSugarGrams?: NutritionRange;
  confidence?: "low" | "medium" | "high";
  note?: string;
  uncertainties?: string[];
};

export type MealRecord = {
  id: string;
  date: string;
  slot: MealSlot;
  photos: MealPhoto[];
  note: string;
  analysis: MealAnalysis | null;
  mouthHeat: Rating | null;
  stomachLoad: Rating | null;
  status: MealStatus;
  error?: string | null;
  confirmedAt?: string | null;
};

export type MealJournalData = {
  date: string;
  meals: Partial<Record<MealSlot, MealRecord | null>>;
};

export type MealCorrection = {
  action: "remove" | "smaller" | "larger" | "add";
  foodName?: string;
  foodIndex?: number;
  name?: string;
};

export type AnalyzeMealInput = {
  date: string;
  slot: MealSlot;
  meal: MealRecord;
  files: File[];
  correction?: MealCorrection;
};

export type MealJournalApi = {
  load?: (date: string) => Promise<MealJournalData>;
  analyze?: (input: AnalyzeMealInput) => Promise<MealRecord>;
  save?: (meal: MealRecord) => Promise<MealRecord>;
  removePhoto?: (mealId: string, photoId: string) => Promise<void>;
};

export function todayInLocalTime() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function randomId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function apiRange(value: unknown): NutritionRange {
  if (!value || typeof value !== "object") return { low: null, likely: null, high: null };
  const range = value as Record<string, unknown>;
  return {
    low: typeof range.low === "number" ? range.low : null,
    likely: typeof range.likely === "number" ? range.likely : null,
    high: typeof range.high === "number" ? range.high : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isMealOrigin(value: unknown): value is MealOrigin {
  return value === "homemade" || value === "prepared" || value === "mixed";
}

function confidence(value: unknown): MealIngredient["confidence"] {
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

function mealFoodKind(value: unknown): MealFoodKind | undefined {
  return value === "dish" || value === "component" || value === "ingredient" ? value : undefined;
}

function mealFoodEvidence(value: unknown): MealFoodEvidence | undefined {
  return value === "visible" || value === "inferred" || value === "unknown" ? value : undefined;
}

function mealFoodEvidenceSource(value: unknown): MealFoodEvidenceSource | undefined {
  return value === "photo" || value === "note" || value === "model" ? value : undefined;
}

export function apiMealToRecord(value: unknown): MealRecord {
  const meal = isRecord(value) ? value : {};
  const analysisRecord = isRecord(meal.analysis) ? meal.analysis : null;
  const successfulRecord = isRecord(meal.lastSuccessfulAnalysis) ? meal.lastSuccessfulAnalysis : null;
  const result = analysisRecord && isRecord(analysisRecord.result)
    ? analysisRecord.result
    : successfulRecord && isRecord(successfulRecord.result)
      ? successfulRecord.result
      : null;
  const resultRecord = analysisRecord && isRecord(analysisRecord.result) ? analysisRecord : successfulRecord;
  const rawPhotos = Array.isArray(meal.photos) ? meal.photos : [];
  const rawFoods = result && Array.isArray(result.foods) ? result.foods : [];
  const totals = result && isRecord(result.totals) ? result.totals : {};
  const ingredients = rawFoods.flatMap((rawFood, index) => {
    if (!isRecord(rawFood)) return [];
    const name = typeof rawFood.name === "string" ? rawFood.name : "";
    if (!name) return [];
    const range = (key: string) => apiRange(rawFood[key]);
    const optionalRange = (key: string) => {
      const value = range(key);
      return value.low === null && value.high === null ? undefined : value;
    };
    return [{
      id: `${resultRecord?.id ?? "analysis"}-${index}`,
      name,
      portion: typeof rawFood.portion === "string" ? rawFood.portion : "",
      preparation: typeof rawFood.preparation === "string" ? rawFood.preparation : null,
      estimatedGrams: typeof rawFood.estimatedGrams === "number" ? rawFood.estimatedGrams : null,
      calories: optionalRange("calories"),
      proteinGrams: optionalRange("proteinGrams"),
      carbohydratesGrams: optionalRange("carbohydrateGrams") ?? optionalRange("carbohydratesGrams"),
      fatGrams: optionalRange("fatGrams"),
      fiberGrams: optionalRange("fiberGrams"),
      sugarGrams: optionalRange("sugarGrams") ?? optionalRange("sugarsGrams") ?? optionalRange("sugars"),
      addedSugarGrams: optionalRange("addedSugarGrams") ?? optionalRange("addedSugarsGrams") ?? optionalRange("addedSugars"),
      confidence: confidence(rawFood.confidence),
      kind: mealFoodKind(rawFood.kind),
      parentId: typeof rawFood.parentId === "string" ? rawFood.parentId : null,
      countedInTotals: typeof rawFood.countedInTotals === "boolean" ? rawFood.countedInTotals : undefined,
      evidence: mealFoodEvidence(rawFood.evidence),
      evidenceSource: mealFoodEvidenceSource(rawFood.evidenceSource),
      evidencePhotoIds: Array.isArray(rawFood.evidencePhotoIds) ? rawFood.evidencePhotoIds.filter((id): id is string => typeof id === "string").slice(0, 5) : undefined,
      quantity: isRecord(rawFood.quantity) ? {
        value: typeof rawFood.quantity.value === "number" ? rawFood.quantity.value : null,
        unit: typeof rawFood.quantity.unit === "string" ? rawFood.quantity.unit : null,
        basis: typeof rawFood.quantity.basis === "string" ? rawFood.quantity.basis : null,
        grams: typeof rawFood.quantity.grams === "number" ? rawFood.quantity.grams : null,
      } : null,
    }];
  });
  const uncertainties = result && Array.isArray(result.uncertainties) ? result.uncertainties.filter((item): item is string => typeof item === "string") : [];
  const dishType = result && typeof result.dishType === "string" && result.dishType.trim() ? result.dishType.trim().slice(0, 80) : null;
  const calorieAnalysis = result && typeof result.calorieAnalysis === "string" && result.calorieAnalysis.trim() ? result.calorieAnalysis.trim().slice(0, 500) : null;
  const mealType = meal.mealType === "breakfast" || meal.mealType === "lunch" || meal.mealType === "dinner" || meal.mealType === "snack" ? meal.mealType : "lunch";
  const rawStatus = meal.status;
  const analysisStatus = analysisRecord?.status;
  return {
    id: typeof meal.id === "string" ? meal.id : randomId("meal"),
    date: typeof meal.mealDate === "string" ? meal.mealDate : todayInLocalTime(),
    slot: mealType,
    note: typeof meal.note === "string" ? meal.note.slice(0, 500) : "",
    photos: rawPhotos.flatMap((rawPhoto) => {
      if (!isRecord(rawPhoto) || typeof rawPhoto.id !== "string") return [];
      return [{
        id: rawPhoto.id,
        url: typeof rawPhoto.url === "string" ? rawPhoto.url : "",
        filename: typeof rawPhoto.filename === "string" ? rawPhoto.filename : undefined,
        origin: isMealOrigin(rawPhoto.origin) ? rawPhoto.origin : null,
        storageStatus: rawPhoto.storageStatus === "purged" || rawPhoto.storageStatus === "purge_pending" ? rawPhoto.storageStatus : "available",
        purgedAt: typeof rawPhoto.purgedAt === "string" ? rawPhoto.purgedAt : null,
      }];
    }),
    analysis: result ? {
      ingredients,
      summary: result && typeof result.summary === "string" ? result.summary : undefined,
      dishType,
      calorieAnalysis,
      calories: apiRange(totals.calories),
      proteinGrams: apiRange(totals.proteinGrams),
      carbohydratesGrams: apiRange(totals.carbohydrateGrams),
      fatGrams: apiRange(totals.fatGrams),
      fiberGrams: apiRange(totals.fiberGrams),
      sugarGrams: apiRange(totals.sugarGrams ?? totals.sugarsGrams ?? totals.sugars),
      addedSugarGrams: apiRange(totals.addedSugarGrams ?? totals.addedSugarsGrams ?? totals.addedSugars),
      confidence: confidence(result.confidence),
      note: uncertainties.length ? uncertainties.join(" · ") : typeof result.summary === "string" ? result.summary : undefined,
    } : null,
    mouthHeat: typeof meal.mouthWarmthIntensity === "number" && meal.mouthWarmthIntensity >= 0 && meal.mouthWarmthIntensity <= 5 ? meal.mouthWarmthIntensity as Rating : null,
    stomachLoad: typeof meal.stomachOverfullIntensity === "number" && meal.stomachOverfullIntensity >= 0 && meal.stomachOverfullIntensity <= 5 ? meal.stomachOverfullIntensity as Rating : null,
    status: rawStatus === "confirmed" ? "confirmed" : analysisStatus === "running" ? "analyzing" : result ? "review" : analysisStatus === "failed" ? "error" : "draft",
    error: typeof analysisRecord?.error === "string" ? analysisRecord.error : null,
    confirmedAt: rawStatus === "confirmed" && typeof meal.updatedAt === "string" ? meal.updatedAt : null,
  };
}
