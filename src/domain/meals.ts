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

export const mealFoodItemSchema = z.object({
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
}).superRefine((analysis, context) => {
  analysis.foods.forEach((food, index) => addNutritionInvariantIssues(food, ["foods", index], context));
  addNutritionInvariantIssues(analysis.totals, ["totals"], context);
});
export type MealAnalysis = z.infer<typeof mealAnalysisSchema>;

/**
 * Single canonical entry point for validating model or user-confirmed meal data.
 * It deliberately does not compare nutrient sums: rounded/wide ranges need not
 * add up exactly to the reported totals.
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
