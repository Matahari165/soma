import { z } from "zod";

/** The four meal slots currently supported by the mobile journal. */
export const mealTypeSchema = z.enum(["breakfast", "lunch", "dinner", "snack"]);
export type MealType = z.infer<typeof mealTypeSchema>;

/** Where the food came from. This is intentionally stored per photo. */
export const mealOriginSchema = z.enum(["homemade", "prepared", "mixed"]);
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

export const mealFoodItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  preparation: z.string().trim().max(240).nullable(),
  portion: z.string().trim().max(120).nullable(),
  estimatedGrams: z.number().finite().min(0).max(10000).nullable(),
  calories: nutritionRangeSchema.nullable(),
  proteinGrams: nutritionRangeSchema.nullable(),
  carbohydrateGrams: nutritionRangeSchema.nullable(),
  fatGrams: nutritionRangeSchema.nullable(),
  fiberGrams: nutritionRangeSchema.nullable(),
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
  }),
  confidence: z.enum(["low", "medium", "high"]),
  uncertainties: z.array(z.string().trim().min(1).max(300)).max(12),
});
export type MealAnalysis = z.infer<typeof mealAnalysisSchema>;

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
};

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
};

export type MealAnalysisRecord = {
  id: string;
  mealId: string;
  status: "running" | "completed" | "failed";
  provider: string;
  model: string;
  result: MealAnalysis | null;
  error: string | null;
  sourcePhotoIds: string[];
  createdAt: string;
  completedAt: string | null;
};

export const MAX_MEAL_PHOTOS = 5;
export const MAX_MEAL_PHOTO_BYTES = 12 * 1024 * 1024;
export const MAX_MEAL_PHOTOS_BYTES = 40 * 1024 * 1024;
/** Allows multipart framing/metadata around the 40 MiB photo payload. */
export const MAX_MEAL_MULTIPART_BYTES = MAX_MEAL_PHOTOS_BYTES + 1 * 1024 * 1024;

export const allowedMealPhotoMimeTypes = new Set<string>(mealPhotoMimeSchema.options);
