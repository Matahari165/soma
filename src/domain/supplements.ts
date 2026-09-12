import { z } from "zod";

/**
 * A supplement is a product reference, not a food portion. Its category
 * determines which future Soma score, if any, may consume its recorded intake.
 */
export const supplementCategories = [
  "vitamin_mineral",
  "protein",
  "creatine",
  "caffeine",
  "electrolyte",
  "other",
] as const;
export const supplementCategorySchema = z.enum(supplementCategories);
export type SupplementCategory = z.infer<typeof supplementCategorySchema>;

export const supplementSources = [
  "product_label",
  "manufacturer",
  "health_professional",
  "personal_record",
  "other",
] as const;
export const supplementSourceSchema = z.enum(supplementSources);
export type SupplementSource = z.infer<typeof supplementSourceSchema>;

const servingUnits = ["g", "mg", "mcg", "ml", "capsule", "tablet", "scoop", "sachet", "drop", "serving"] as const;
export const supplementServingSchema = z.object({
  quantity: z.number().finite().positive().max(100000),
  unit: z.enum(servingUnits),
  label: z.string().trim().min(1).max(120),
});
export type SupplementServing = z.infer<typeof supplementServingSchema>;

const nutrientUnits = ["g", "mg", "mcg", "iu", "kcal"] as const;
export const supplementNutrientSchema = z.object({
  key: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9_:-]*$/),
  label: z.string().trim().min(1).max(120),
  amount: z.number().finite().nonnegative().max(100000000),
  unit: z.enum(nutrientUnits),
});
export type SupplementNutrient = z.infer<typeof supplementNutrientSchema>;

export const supplementFrequencySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("daily"), timesPerDay: z.number().int().positive().max(24) }),
  z.object({
    kind: z.literal("weekly"),
    timesPerWeek: z.number().int().positive().max(7),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional().default([]),
  }),
  z.object({ kind: z.literal("as_needed"), instructions: z.string().trim().min(1).max(240).nullable().optional().default(null) }),
  z.object({ kind: z.literal("custom"), instructions: z.string().trim().min(1).max(240) }),
]);
export type SupplementFrequency = z.infer<typeof supplementFrequencySchema>;

const supplementDefinitionFields = z.object({
  productName: z.string().trim().min(1).max(160),
  brand: z.string().trim().min(1).max(120).nullable().optional().default(null),
  category: supplementCategorySchema,
  source: supplementSourceSchema,
  sourceReference: z.string().trim().min(1).max(240).nullable().optional().default(null),
  serving: supplementServingSchema,
  nutrients: z.array(supplementNutrientSchema).max(60).default([]),
  frequency: supplementFrequencySchema,
  // One short, human-readable cue is enough for the daily check-in. Keep it
  // separate from notes so future UI can show it without exposing product
  // metadata again on every day.
  usageInstruction: z.string().trim().min(1).max(240).nullable().optional(),
  notes: z.string().trim().min(1).max(500).nullable().optional().default(null),
});

export const supplementDefinitionInputSchema = supplementDefinitionFields;
export type SupplementDefinitionInput = z.infer<typeof supplementDefinitionInputSchema>;

export const supplementDefinitionUpdateSchema = supplementDefinitionFields.partial().extend({
  archivedAt: z.string().datetime({ offset: true }).nullable().optional(),
}).refine((input) => Object.keys(input).length > 0, {
  message: "At least one supplement definition field is required.",
});
export type SupplementDefinitionUpdate = z.infer<typeof supplementDefinitionUpdateSchema>;

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO civil date.");
const supplementStatusSchema = z.enum(["taken", "skipped", "not_recorded"]);
const plannedSupplementDoseSchema = z.object({
  servings: z.number().finite().positive().max(1000),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional().default(null),
});

const actualSupplementDoseSchema = z.object({
  status: supplementStatusSchema,
  servings: z.number().finite().positive().max(1000).nullable().optional().default(null),
  takenAt: z.string().datetime({ offset: true }).nullable().optional().default(null),
  note: z.string().trim().min(1).max(300).nullable().optional().default(null),
}).superRefine((actual, context) => {
  if (actual.status !== "taken" && actual.servings !== null) {
    context.addIssue({ code: "custom", path: ["servings"], message: "Only a taken supplement can have actual servings." });
  }
  if (actual.status !== "taken" && actual.takenAt !== null) {
    context.addIssue({ code: "custom", path: ["takenAt"], message: "Only a taken supplement can have a takenAt timestamp." });
  }
});

const defaultActualSupplementDose = { status: "not_recorded" as const, servings: null, takenAt: null, note: null };

const supplementEntryBaseFields = z.object({
  definitionId: z.string().trim().min(1).max(120),
  entryDate: isoDateSchema,
  // The old API required a plan. A daily check-in only needs the product and
  // date, so a single configured dose is the safe backwards-compatible plan.
  planned: plannedSupplementDoseSchema.optional().default({ servings: 1, scheduledAt: null }),
  actual: actualSupplementDoseSchema.optional().default(defaultActualSupplementDose),
  status: supplementStatusSchema.optional(),
  note: z.string().trim().min(1).max(300).nullable().optional().default(null),
});

const supplementEntryInputFields = supplementEntryBaseFields.superRefine((entry, context) => {
  if (entry.status && entry.actual.status !== "not_recorded" && entry.actual.status !== entry.status) {
    context.addIssue({ code: "custom", path: ["status"], message: "The top-level status and actual status must match." });
  }
}).transform(({ status, ...entry }) => ({
  ...entry,
  actual: status ? { ...entry.actual, status } : entry.actual,
}));
export const supplementEntryInputSchema = supplementEntryInputFields;
export type SupplementEntryInput = z.infer<typeof supplementEntryInputSchema>;

export const supplementEntryUpdateSchema = z.object({
  definitionId: supplementEntryBaseFields.shape.definitionId.optional(),
  entryDate: isoDateSchema.optional(),
  planned: plannedSupplementDoseSchema.optional(),
  actual: actualSupplementDoseSchema.optional(),
  status: supplementStatusSchema.optional(),
  note: supplementEntryBaseFields.shape.note.optional(),
}).superRefine((entry, context) => {
  if (entry.status && entry.actual && entry.actual.status !== "not_recorded" && entry.actual.status !== entry.status) {
    context.addIssue({ code: "custom", path: ["status"], message: "The top-level status and actual status must match." });
  }
}).transform(({ status, ...entry }) => ({
  ...entry,
  ...(status ? { actual: { ...(entry.actual ?? defaultActualSupplementDose), status } } : {}),
})).refine((input) => Object.keys(input).length > 0, {
  message: "At least one supplement entry field is required.",
});
export type SupplementEntryUpdate = z.infer<typeof supplementEntryUpdateSchema>;

export const supplementDefinitionRecordSchema = supplementDefinitionInputSchema.extend({
  id: z.string().trim().min(1).max(120),
  userId: z.string().trim().min(1).max(160),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  archivedAt: z.string().datetime({ offset: true }).nullable().optional(),
});
export type SupplementDefinition = z.infer<typeof supplementDefinitionRecordSchema>;

const supplementEntryRecordFields = supplementEntryBaseFields.extend({
  id: z.string().trim().min(1).max(120),
  userId: z.string().trim().min(1).max(160),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export const supplementEntryRecordSchema = supplementEntryRecordFields.superRefine((entry, context) => {
  if (entry.status && entry.actual.status !== "not_recorded" && entry.actual.status !== entry.status) {
    context.addIssue({ code: "custom", path: ["status"], message: "The top-level status and actual status must match." });
  }
}).transform(({ status, ...entry }) => ({
  ...entry,
  actual: status ? { ...entry.actual, status } : entry.actual,
}));
export type SupplementEntry = z.infer<typeof supplementEntryRecordSchema>;

export type SupplementContributionScope = "micronutrients" | "protein" | "separate";

/**
 * This is deliberately derived from category. It prevents a creatine or
 * caffeine entry from being silently treated as food quality or variety.
 */
export function supplementContributionScope(category: SupplementCategory, nutrients?: readonly SupplementNutrient[], source?: SupplementSource): SupplementContributionScope {
  // Never fold an unverified or empty product composition into meal totals.
  // The one-argument form remains compatible with callers that only need the
  // category's legacy label.
  if (nutrients && source && (nutrients.length === 0 || source === "personal_record" || source === "other")) return "separate";
  if (category === "protein") return "protein";
  if (category === "vitamin_mineral" || category === "electrolyte") return "micronutrients";
  return "separate";
}

export function supplementDefinitionToView(definition: SupplementDefinition) {
  const { userId, ...view } = definition;
  void userId;
  return { ...view, contributionScope: supplementContributionScope(definition.category, definition.nutrients, definition.source) };
}

export function supplementEntryToView(entry: SupplementEntry) {
  const { userId, ...view } = entry;
  void userId;
  return view;
}
