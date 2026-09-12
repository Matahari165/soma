import { z } from "zod";

/** The four meal slots currently supported by the mobile journal. */
export const mealTypeSchema = z.enum(["breakfast", "lunch", "dinner", "snack"]);
export type MealType = z.infer<typeof mealTypeSchema>;

/** Where the food came from. This is intentionally stored per photo. */
export const mealOriginSchema = z.enum(["homemade", "prepared", "mixed", "unknown"]);
export type MealOrigin = z.infer<typeof mealOriginSchema>;

/** A missing answer is null; an explicit "none" is stored as 0. */
export const mealFeelingInputSchema = z.union([
  z.literal("none"),
  z.number().int().min(1).max(5),
]);
export type MealFeelingInput = z.infer<typeof mealFeelingInputSchema>;

export const mealFeelingSchema = z.number().int().min(0).max(5).nullable();
export type MealFeeling = z.infer<typeof mealFeelingSchema>;

export function normalizeMealFeeling(value: MealFeelingInput | null | undefined): MealFeeling {
  if (value === undefined || value === null) return null;
  return value === "none" ? 0 : value;
}

export function serializeMealFeeling(value: MealFeeling): MealFeelingInput | null {
  if (value === null) return null;
  return value === 0 ? "none" : value;
}

export const mealStatusSchema = z.enum(["draft", "confirmed"]);
export type MealStatus = z.infer<typeof mealStatusSchema>;

export const mealPhotoMimeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);
export type MealPhotoMime = z.infer<typeof mealPhotoMimeSchema>;

export const nutritionRangeSchema = z.object({
  low: z.number().finite().min(0),
  likely: z.number().finite().min(0),
  high: z.number().finite().min(0),
}).refine((range) => range.low <= range.likely && range.likely <= range.high, { message: "The likely estimate must be between the lower and upper estimates." });
export type NutritionRange = z.infer<typeof nutritionRangeSchema>;

export const mealFoodKindSchema = z.enum(["dish", "component", "ingredient"]);
export type MealFoodKind = z.infer<typeof mealFoodKindSchema>;

/** The meal course is a display relationship, not a nutrition judgement. */
export const mealFoodCourseSchema = z.enum(["starter", "main", "side", "dessert"]);
export type MealFoodCourse = z.infer<typeof mealFoodCourseSchema>;

/** Broad food groups used for auditable balance and variety signals. */
export const mealFoodGroupSchema = z.enum([
  "fruit",
  "vegetable",
  "legume",
  "whole_grain",
  "refined_grain",
  "potato",
  "animal_protein",
  "plant_protein",
  "egg",
  "dairy",
  "nuts_seeds",
  "added_fat",
  "sauce",
  "sweet",
  "beverage",
  "other",
]);
export type MealFoodGroup = z.infer<typeof mealFoodGroupSchema>;

/** Optional descriptive axes used by composable food scoring. */
export const mealNovaGroupSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export type MealNovaGroup = z.infer<typeof mealNovaGroupSchema>;

/** Concentrated and liquid sugar exposure are independent observations. */
export const mealSugarExposureSchema = z.object({
  concentrated: z.boolean().nullable(),
  liquid: z.boolean().nullable(),
});
export type MealSugarExposure = z.infer<typeof mealSugarExposureSchema>;

/** Descriptive food properties; these are not quality judgements or scores. */
export const mealQualityPropertySchema = z.enum([
  "whole_food",
  "minimally_processed",
  "fermented",
  "fiber_source",
  "protein_source",
  "unsaturated_fat_source",
]);
export type MealQualityProperty = z.infer<typeof mealQualityPropertySchema>;

/** Distinguishes an unobserved property from a property that could not be assessed. */
export const mealObservationStatusSchema = z.enum(["observed", "none_observed", "unknown"]);
export type MealObservationStatus = z.infer<typeof mealObservationStatusSchema>;

export const mealObservationConfidenceSchema = z.enum(["low", "medium", "high"]);
export type MealObservationConfidence = z.infer<typeof mealObservationConfidenceSchema>;

/** Structured per-food coverage for the axes used by the meal-balance indicator. */
export const mealFoodObservationSchema = z.object({
  portion: mealObservationStatusSchema,
  novaGroup: mealObservationStatusSchema,
  sugarExposure: mealObservationStatusSchema,
  qualityProperties: mealObservationStatusSchema,
  confidence: z.object({
    portion: mealObservationConfidenceSchema,
    novaGroup: mealObservationConfidenceSchema,
    sugarExposure: mealObservationConfidenceSchema,
    qualityProperties: mealObservationConfidenceSchema,
  }).optional(),
});
export type MealFoodObservation = z.infer<typeof mealFoodObservationSchema>;

export const mealUncertaintyCodeSchema = z.enum([
  "food_identity_unknown",
  "portion_unknown",
  "brand_unknown",
  "recipe_unknown",
  "preparation_unknown",
  "sauce_or_oil_unknown",
  "nova_group_unknown",
  "sugar_exposure_unknown",
  "quality_properties_unknown",
  "composition_uncertain",
  "duplicate_risk",
  "nutrition_unknown",
]);
export type MealUncertaintyCode = z.infer<typeof mealUncertaintyCodeSchema>;

export const mealUncertaintyFieldSchema = z.enum([
  "identity",
  "portion",
  "brand",
  "recipe",
  "preparation",
  "sauceOrOil",
  "novaGroup",
  "sugarExposure",
  "qualityProperties",
  "nutrition",
  "composition",
  "source",
]);
export type MealUncertaintyField = z.infer<typeof mealUncertaintyFieldSchema>;

/** Machine-readable uncertainty; the legacy free-form uncertainties remain supported. */
export const mealUncertaintySignalSchema = z.object({
  code: mealUncertaintyCodeSchema,
  field: mealUncertaintyFieldSchema,
  foodId: z.string().trim().min(1).max(120).nullable(),
  severity: z.enum(["low", "medium", "high"]),
  detail: z.string().trim().min(1).max(240),
});
export type MealUncertaintySignal = z.infer<typeof mealUncertaintySignalSchema>;

export const mealEvidenceSchema = z.enum(["visible", "inferred", "unknown"]);
export type MealEvidence = z.infer<typeof mealEvidenceSchema>;

export const mealEvidenceSourceSchema = z.enum(["photo", "note", "model"]);
export type MealEvidenceSource = z.infer<typeof mealEvidenceSourceSchema>;

export const mealQuantitySchema = z.object({
  value: z.number().finite().min(0).nullable(),
  unit: z.string().trim().max(40).nullable(),
  basis: z.string().trim().max(80).nullable(),
  grams: z.number().finite().min(0).max(10000).nullable(),
});
export type MealQuantity = z.infer<typeof mealQuantitySchema>;

/** A correction is deliberately free-form: Grok can interpret the user's wording in context. */
export const mealAnalysisCorrectionSchema = z.string().trim().min(1).max(500);
export type MealAnalysisCorrection = z.infer<typeof mealAnalysisCorrectionSchema>;

type NutritionInvariantTarget = {
  carbohydrateGrams?: NutritionRange | null;
  sugarGrams?: NutritionRange | null;
  addedSugarGrams?: NutritionRange | null;
};

function addNutritionInvariantIssues(
  target: NutritionInvariantTarget,
  path: (string | number)[],
  context: z.RefinementCtx,
) {
  const sugar = target.sugarGrams;
  const addedSugar = target.addedSugarGrams;
  const carbohydrates = target.carbohydrateGrams;
  // Reject only disjoint intervals. Overlapping ranges remain compatible even
  // when their upper bounds differ because the model is expressing uncertainty.
  if (sugar && addedSugar && addedSugar.low > sugar.high) {
    context.addIssue({ code: "custom", path: [...path, "addedSugarGrams"], message: "Added sugar cannot exceed total sugar." });
  }
  if (sugar && carbohydrates && sugar.low > carbohydrates.high) {
    context.addIssue({ code: "custom", path: [...path, "sugarGrams"], message: "Total sugar cannot exceed carbohydrates." });
  }
}

type MealFoodForValidation = {
  id?: string;
  name: string;
  preparation: string | null;
  portion: string | null;
  estimatedGrams: number | null;
  kind?: MealFoodKind;
  parentId?: string | null;
  countedInTotals?: boolean;
  alcoholic?: boolean;
  novaGroup?: MealNovaGroup | null;
  sugarExposure?: MealSugarExposure | null;
  qualityProperties?: MealQualityProperty[];
  observation?: MealFoodObservation;
  quantity?: MealQuantity | null;
  calories: NutritionRange | null;
  proteinGrams: NutritionRange | null;
  carbohydrateGrams: NutritionRange | null;
  fatGrams: NutritionRange | null;
  fiberGrams: NutritionRange | null;
  sugarGrams?: NutritionRange | null;
  addedSugarGrams?: NutritionRange | null;
};

function addMealStructureIssues(
  analysis: {
    foods: Array<MealFoodForValidation>;
    uncertaintySignals?: Array<z.infer<typeof mealUncertaintySignalSchema>>;
  },
  context: z.RefinementCtx,
) {
  const foodsWithIds = analysis.foods.filter((food) => food.id);
  const hasCompleteIds = analysis.foods.length > 0 && foodsWithIds.length === analysis.foods.length;
  const ids = new Map<string, number>();
  analysis.foods.forEach((food, index) => {
    if (!food.id) return;
    const previousIndex = ids.get(food.id);
    if (previousIndex !== undefined) {
      context.addIssue({ code: "custom", path: ["foods", index, "id"], message: `Duplicate food id; already used at index ${previousIndex}.` });
    } else {
      ids.set(food.id, index);
    }
  });

  analysis.foods.forEach((food, index) => {
    const path = ["foods", index] as (string | number)[];
    const parentIndex = food.parentId ? ids.get(food.parentId) : undefined;
    const parent = parentIndex === undefined ? undefined : analysis.foods[parentIndex];

    // Old analyses may have parentId without local ids; only enforce references
    // when the new id contract is present somewhere in the same response.
    if (hasCompleteIds && food.parentId && parentIndex === undefined) {
      context.addIssue({ code: "custom", path: [...path, "parentId"], message: "The composed-dish parentId must reference a food id in the same analysis." });
    }
    if (food.id && food.parentId === food.id) {
      context.addIssue({ code: "custom", path: [...path, "parentId"], message: "A food cannot be its own composed-dish parent." });
    }
    if (food.parentId && food.kind === "dish") {
      context.addIssue({ code: "custom", path: [...path, "kind"], message: "A dish cannot itself be a component of another food." });
    }
    if (parent?.kind && parent.kind !== "dish") {
      context.addIssue({ code: "custom", path: [...path, "parentId"], message: "A composed-dish parent must have kind=dish." });
    }
    if (parent?.countedInTotals === true && food.countedInTotals === true) {
      context.addIssue({ code: "custom", path: [...path, "countedInTotals"], message: "A counted component cannot also have a counted parent dish." });
    }

    if (food.alcoholic === true) {
      if (food.countedInTotals !== false) {
        context.addIssue({ code: "custom", path: [...path, "countedInTotals"], message: "Alcoholic foods must be excluded from countedInTotals." });
      }
    }

    const observation = food.observation;
    if (!observation) return;
    if (observation.portion === "none_observed") {
      context.addIssue({ code: "custom", path: [...path, "observation", "portion"], message: "A portion is unknown when it was not provided; none_observed is reserved for reviewed descriptive axes." });
    }
    const hasPortionEvidence = Boolean(food.portion?.trim() || food.estimatedGrams != null || food.quantity?.value != null || food.quantity?.grams != null);
    if (observation.portion === "observed" && !hasPortionEvidence) {
      context.addIssue({ code: "custom", path: [...path, "observation", "portion"], message: "An observed portion needs a portion label or quantity." });
    }
    if (observation.portion === "unknown" && hasPortionEvidence) {
      context.addIssue({ code: "custom", path: [...path, "observation", "portion"], message: "An unknown portion cannot carry a portion estimate." });
    }
    if (observation.novaGroup === "none_observed") {
      context.addIssue({ code: "custom", path: [...path, "observation", "novaGroup"], message: "NOVA is either identified or unknown; it is not a none_observed property." });
    }
    if (observation.novaGroup === "observed" && food.novaGroup == null) {
      context.addIssue({ code: "custom", path: [...path, "observation", "novaGroup"], message: "An observed NOVA group needs a value." });
    }
    if (observation.novaGroup === "unknown" && food.novaGroup != null) {
      context.addIssue({ code: "custom", path: [...path, "novaGroup"], message: "An unknown NOVA group must not carry a value." });
    }
    const sugarExposureKnown = food.sugarExposure != null && food.sugarExposure.concentrated !== null && food.sugarExposure.liquid !== null;
    if (observation.sugarExposure === "observed" && !sugarExposureKnown) {
      context.addIssue({ code: "custom", path: [...path, "observation", "sugarExposure"], message: "An observed sugar exposure needs a value." });
    }
    if (observation.sugarExposure === "none_observed" && (food.sugarExposure?.concentrated !== false || food.sugarExposure?.liquid !== false)) {
      context.addIssue({ code: "custom", path: [...path, "sugarExposure"], message: "none_observed sugar exposure must explicitly set concentrated=false and liquid=false." });
    }
    if (observation.sugarExposure === "unknown" && food.sugarExposure != null) {
      context.addIssue({ code: "custom", path: [...path, "sugarExposure"], message: "An unknown sugar exposure must not carry a partial value." });
    }
    if (observation.qualityProperties === "observed" && (!food.qualityProperties || food.qualityProperties.length === 0)) {
      context.addIssue({ code: "custom", path: [...path, "observation", "qualityProperties"], message: "Observed quality properties need at least one descriptive property." });
    }
    if (observation.qualityProperties === "none_observed" && (!food.qualityProperties || food.qualityProperties.length !== 0)) {
      context.addIssue({ code: "custom", path: [...path, "qualityProperties"], message: "none_observed quality properties must be represented by an empty array." });
    }
    if (observation.qualityProperties === "unknown" && food.qualityProperties !== undefined) {
      context.addIssue({ code: "custom", path: [...path, "qualityProperties"], message: "Unknown quality properties must be omitted, not represented as an empty observation." });
    }
  });

  const signals = analysis.uncertaintySignals ?? [];
  const signalKeys = new Set<string>();
  signals.forEach((signal, index) => {
    const key = `${signal.code}:${signal.field}:${signal.foodId ?? "meal"}`;
    if (signalKeys.has(key)) {
      context.addIssue({ code: "custom", path: ["uncertaintySignals", index], message: "Duplicate structured uncertainty signal." });
    }
    if (hasCompleteIds && signal.foodId && !ids.has(signal.foodId)) {
      context.addIssue({ code: "custom", path: ["uncertaintySignals", index, "foodId"], message: "The uncertainty signal foodId must reference a food id in the same analysis." });
    }
    signalKeys.add(key);
  });
}

const structuredNutritionFields = [
  "calories",
  "proteinGrams",
  "carbohydrateGrams",
  "fatGrams",
  "fiberGrams",
  "sugarGrams",
  "addedSugarGrams",
] as const;

function addStructuredNutritionIssues(
  analysis: { foods: Array<MealFoodForValidation>; totals: Record<string, NutritionRange | null | undefined> },
  context: z.RefinementCtx,
) {
  // New responses explicitly declare which foods contribute to totals. Old
  // analyses omit that field and must remain valid and readable.
  if (!analysis.foods.length || !analysis.foods.every((food) => typeof food.countedInTotals === "boolean")) return;
  const countedFoods = analysis.foods.filter((food) => food.countedInTotals !== false && food.alcoholic !== true);
  if (!countedFoods.length) return;

  structuredNutritionFields.forEach((field) => {
    const total = analysis.totals[field];
    if (!total) return;
    const ranges = countedFoods.map((food) => food[field]).filter((range): range is NutritionRange => range !== null && range !== undefined);
    if (ranges.length !== countedFoods.length) return;
    const sumLow = ranges.reduce((sum, range) => sum + range.low, 0);
    const sumHigh = ranges.reduce((sum, range) => sum + range.high, 0);
    if (sumHigh < total.low || total.high < sumLow) {
      context.addIssue({ code: "custom", path: ["totals", field], message: "The total range must overlap the interval sum of counted foods." });
    }
  });
}

export const mealFoodItemSchema = z.object({
  /** Stable local identifier used only to validate composed-dish relationships. */
  id: z.string().trim().min(1).max(120).optional(),
  name: z.string().trim().min(1).max(120),
  preparation: z.string().trim().max(240).nullable(),
  portion: z.string().trim().max(120).nullable(),
  estimatedGrams: z.number().finite().min(0).max(10000).nullable(),
  /** Internal provenance fields; they are intentionally optional for old analyses. */
  kind: mealFoodKindSchema.optional(),
  parentId: z.string().trim().max(120).nullable().optional(),
  course: mealFoodCourseSchema.nullable().optional(),
  countedInTotals: z.boolean().optional(),
  /** Optional on old analyses; new model responses should provide both fields. */
  foodGroups: z.array(mealFoodGroupSchema).max(4).optional(),
  varietyKey: z.string().trim().max(80).nullable().optional(),
  evidence: mealEvidenceSchema.optional(),
  evidenceSource: mealEvidenceSourceSchema.optional(),
  evidencePhotoIds: z.array(z.string().trim().min(1).max(120)).max(6).optional(),
  quantity: mealQuantitySchema.nullable().optional(),
  /** Optional labels; old analyses remain valid and simply omit them. */
  alcoholic: z.boolean().optional(),
  novaGroup: mealNovaGroupSchema.nullable().optional(),
  sugarExposure: mealSugarExposureSchema.nullable().optional(),
  qualityProperties: z.array(mealQualityPropertySchema).max(8).optional(),
  /** Optional for old analyses; required in new provider responses. */
  observation: mealFoodObservationSchema.optional(),
  calories: nutritionRangeSchema.nullable(),
  proteinGrams: nutritionRangeSchema.nullable(),
  carbohydrateGrams: nutritionRangeSchema.nullable(),
  fatGrams: nutritionRangeSchema.nullable(),
  fiberGrams: nutritionRangeSchema.nullable(),
  /** Added in v2; old analyses are normalized to null when read. */
  sugarGrams: nutritionRangeSchema.nullable().optional(),
  addedSugarGrams: nutritionRangeSchema.nullable().optional(),
  confidence: z.enum(["low", "medium", "high"]),
});
export type MealFoodItem = z.infer<typeof mealFoodItemSchema>;

export const mealAnalysisSchema = z.object({
  summary: z.string().trim().min(1).max(800),
  dishType: z.string().trim().max(80).nullable().optional().default(null),
  calorieAnalysis: z.string().trim().max(500).nullable().optional().default(null),
  foods: z.array(mealFoodItemSchema).max(30),
  totals: z.object({
    calories: nutritionRangeSchema.nullable(),
    proteinGrams: nutritionRangeSchema.nullable(),
    carbohydrateGrams: nutritionRangeSchema.nullable(),
    fatGrams: nutritionRangeSchema.nullable(),
    fiberGrams: nutritionRangeSchema.nullable(),
    sugarGrams: nutritionRangeSchema.nullable().optional(),
    addedSugarGrams: nutritionRangeSchema.nullable().optional(),
  }),
  confidence: z.enum(["low", "medium", "high"]),
  uncertainties: z.array(z.string().trim().min(1).max(300)).max(12),
  /** Optional for old analyses; required in new provider responses. */
  uncertaintySignals: z.array(mealUncertaintySignalSchema).max(20).optional(),
}).superRefine((analysis, context) => {
  analysis.foods.forEach((food, index) => addNutritionInvariantIssues(food, ["foods", index], context));
  addNutritionInvariantIssues(analysis.totals, ["totals"], context);
  addMealStructureIssues(analysis, context);
  addStructuredNutritionIssues(analysis, context);
});
export type MealAnalysis = z.infer<typeof mealAnalysisSchema>;

/**
 * Single canonical entry point for validating model or user-confirmed meal data.
 * It deliberately does not compare exact nutrient sums: rounded/wide ranges
 * need not add up exactly. New responses only reject totals whose interval is
 * disjoint from the interval sum of all counted foods.
 */
export function validateMealAnalysis(value: unknown): MealAnalysis {
  return mealAnalysisSchema.parse(value);
}

export const createMealInputSchema = z.object({
  mealDate: z.iso.date(),
  mealType: mealTypeSchema,
  /** La note (max 500) fait foi comme contenu : un repas texte sans photo est valide. Confirmation exige photos > 0 OU note non-vide. */
  note: z.string().trim().max(500).nullable().optional(),
  status: mealStatusSchema.optional(),
  mouthWarmthIntensity: mealFeelingInputSchema.nullable().optional(),
  stomachOverfullIntensity: mealFeelingInputSchema.nullable().optional(),
  /** A client-generated value makes retries safe across mobile reconnects. */
  idempotencyKey: z.string().trim().min(8).max(160).optional(),
});
export type CreateMealInput = z.infer<typeof createMealInputSchema>;

export const updateMealInputSchema = z.object({
  mealDate: z.iso.date().optional(),
  mealType: mealTypeSchema.optional(),
  /** Même règle que create : la note non-vide autorise confirmed sans photo. */
  note: z.string().trim().max(500).nullable().optional(),
  status: mealStatusSchema.optional(),
  mouthWarmthIntensity: mealFeelingInputSchema.nullable().optional(),
  stomachOverfullIntensity: mealFeelingInputSchema.nullable().optional(),
  /** A user-confirmed correction is a new provenance-preserving analysis row. */
  confirmedAnalysis: mealAnalysisSchema.nullable().optional(),
}).refine((input) => Object.keys(input).length > 0, { message: "At least one meal field is required." });
export type UpdateMealInput = z.infer<typeof updateMealInputSchema>;

export const mealAnalysisRequestSchema = z.object({
  force: z.boolean().optional().default(false),
  idempotencyKey: z.string().trim().min(8).max(160).optional(),
  correction: mealAnalysisCorrectionSchema.optional(),
});

export type MealPhoto = {
  id: string;
  mealId: string;
  origin: MealOrigin;
  objectPath: string;
  mimeType: MealPhotoMime;
  bytes: number;
  filename?: string | null;
  createdAt: string;
  /** Storage lifecycle is explicit: metadata survives binary purge. */
  storageStatus?: MealPhotoStorageStatus;
  purgedAt?: string | null;
};

export const mealPhotoStorageStatusSchema = z.enum(["available", "purge_pending", "purged"]);
export type MealPhotoStorageStatus = z.infer<typeof mealPhotoStorageStatusSchema>;

export type Meal = {
  id: string;
  userId: string;
  mealDate: string;
  mealType: MealType;
  note: string | null;
  status: MealStatus;
  mouthWarmthIntensity: MealFeeling;
  stomachOverfullIntensity: MealFeeling;
  createdAt: string;
  updatedAt: string;
  photos: MealPhoto[];
  analysis: MealAnalysisRecord | null;
  /** Latest successful result retained when a newer retry fails. */
  lastSuccessfulAnalysis?: MealAnalysisRecord | null;
};

export type MealAnalysisRecord = {
  id: string;
  mealId: string;
  status: "running" | "completed" | "failed";
  provider: string;
  model: string;
  result: MealAnalysis | null;
  error: string | null;
  /** Optional provenance of the source snapshot; old analysis rows omit it. */
  sourceFingerprint?: string | null;
  /** Stable, non-sensitive diagnostic category for UI/log correlation. */
  errorCode?: "provider_auth" | "provider_rate_limited" | "provider_request" | "provider_timeout" | "provider_unavailable" | "provider_empty_response" | "response_parse_error" | "response_schema_error" | "invalid_response" | "source_unavailable" | "storage_error" | "unknown_analysis_error" | "photo_purge_pending" | null;
  sourcePhotoIds: string[];
  createdAt: string;
  completedAt: string | null;
};

export const MAX_MEAL_PHOTOS = 6;
export const MAX_MEAL_PHOTO_BYTES = 12 * 1024 * 1024;
export const MAX_MEAL_PHOTOS_BYTES = 40 * 1024 * 1024;
/** Allows multipart framing/metadata around the 40 MiB photo payload. */
export const MAX_MEAL_MULTIPART_BYTES = MAX_MEAL_PHOTOS_BYTES + 1 * 1024 * 1024;

export const allowedMealPhotoMimeTypes = new Set<string>(mealPhotoMimeSchema.options);
/** Canonical formats stored by new analysis uploads and accepted by both providers. */
export const mealAnalysisPhotoMimeTypes = new Set<string>(["image/jpeg", "image/png"]);
