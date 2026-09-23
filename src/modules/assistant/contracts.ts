import { z } from "zod";

export const assistantQualitySchema = z.enum(["fast", "balanced", "deep"]);
export type AssistantQuality = z.infer<typeof assistantQualitySchema>;

export const assistantRoleSchema = z.enum(["user", "assistant", "tool"]);

export const assistantTextPartSchema = z.object({ type: z.literal("text"), text: z.string().min(1).max(50_000) });
export const assistantAttachmentPartSchema = z.object({
  type: z.literal("attachment"),
  attachmentId: z.uuid(),
  mediaType: z.enum(["image/jpeg", "image/png"]),
});
export const assistantAttachmentMediaTypeSchema = z.enum(["image/jpeg", "image/png"]);
export const assistantAttachmentPurposeSchema = z.enum(["meal", "context"]);
export const assistantAttachmentMetadataSchema = z.object({
  objectPath: z.string().min(1).max(1_024).refine((value) => !value.includes("..") && !value.includes("\\"), "Invalid assistant attachment path."),
  mediaType: assistantAttachmentMediaTypeSchema,
  byteSize: z.number().int().min(1).max(15_728_640),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  purpose: assistantAttachmentPurposeSchema,
}).superRefine((value, context) => {
  const extension = value.objectPath.split(".").at(-1)?.toLowerCase();
  const allowedExtensions: Record<z.infer<typeof assistantAttachmentMediaTypeSchema>, string[]> = {
    "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"],
  };
  if (!extension || !allowedExtensions[value.mediaType].includes(extension)) {
    context.addIssue({ code: "custom", message: "Attachment extension does not match its media type.", path: ["objectPath"] });
  }
});
export const assistantDataSummaryPartSchema = z.object({
  type: z.literal("data-summary"),
  label: z.string().min(1).max(120),
  period: z.object({ from: z.iso.date(), to: z.iso.date() }).nullable(),
  itemCount: z.number().int().nonnegative(),
  domains: z.array(z.enum(["nutrition", "sleep", "recovery", "effort"])).max(4),
});
export const assistantActionPartSchema = z.object({
  type: z.literal("action"),
  actionId: z.uuid(),
  actionType: z.enum(["meal.create", "goal_set.confirm", "goal.update", "plan_version.confirm", "memory.confirm", "memory.reject"]),
  state: z.enum(["proposed", "confirmed", "executing", "executed", "undoing", "undone", "failed", "expired"]),
});
export const assistantMessagePartSchema = z.discriminatedUnion("type", [
  assistantTextPartSchema, assistantAttachmentPartSchema, assistantDataSummaryPartSchema, assistantActionPartSchema,
]);

export const assistantMessageSchema = z.object({
  id: z.uuid(), conversationId: z.uuid(), sequence: z.number().int().positive(),
  role: assistantRoleSchema, parts: z.array(assistantMessagePartSchema).min(1).max(40),
  status: z.enum(["pending", "streaming", "completed", "failed", "cancelled"]),
  createdAt: z.iso.datetime(),
});
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;
export type AssistantMessagePart = z.infer<typeof assistantMessagePartSchema>;

export const assistantMemoryInputSchema = z.object({
  kind: z.enum(["preference", "constraint", "routine", "fact", "instruction"]),
  content: z.string().trim().min(1).max(4_000),
  structuredValue: z.record(z.string(), z.unknown()).nullable().default(null),
  sensitivity: z.enum(["ordinary", "personal", "health"]),
  validFrom: z.iso.date().nullable().default(null), validUntil: z.iso.date().nullable().default(null),
}).refine((value) => !value.validFrom || !value.validUntil || value.validUntil >= value.validFrom, {
  message: "The memory validity period is inverted.", path: ["validUntil"],
});

export const assistantGoalValueSchema = z.object({
  value: z.number().finite().nullable().default(null), unit: z.string().trim().min(1).max(40).nullable().default(null),
  note: z.string().trim().min(1).max(500).nullable().default(null),
});
export const assistantGoalInputSchema = z.object({
  label: z.string().trim().min(1).max(500),
  status: z.enum(["active", "paused", "completed", "cancelled"]).default("active"),
  domain: z.enum(["nutrition", "sleep", "recovery", "effort", "cross_domain", "other"]).nullable().default(null),
  baseline: assistantGoalValueSchema.nullable().default(null), target: assistantGoalValueSchema.nullable().default(null),
  horizon: z.object({ targetDate: z.iso.date().nullable().default(null), description: z.string().trim().min(1).max(300).nullable().default(null) }).nullable().default(null),
  cadence: z.record(z.string(), z.unknown()).nullable().default(null),
  constraints: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
  successCriteria: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
});
export const assistantGoalSetInputSchema = z.object({
  primaryDirection: z.string().trim().min(1).max(240),
  primaryGoalType: z.enum(["build_muscle", "improve_endurance", "improve_cardio", "general_fitness", "maintain_health", "other"]).nullable().default(null),
  secondaryDirections: z.array(z.string().trim().min(1).max(240)).max(10).default([]),
  goals: z.array(assistantGoalInputSchema).max(100).default([]),
});

export const assistantGoalRevisionSchema = z.object({
  primaryDirection: assistantGoalSetInputSchema.shape.primaryDirection.optional(),
  primaryGoalType: z.enum(["build_muscle", "improve_endurance", "improve_cardio", "general_fitness", "maintain_health", "other"]).nullable().optional(),
  secondaryDirections: z.array(z.string().trim().min(1).max(240)).max(10).optional(),
  goalUpdates: z.array(z.object({
    goalId: z.uuid(),
    changes: z.object({
      label: z.string().trim().min(1).max(500).optional(),
      status: z.enum(["active", "paused", "completed", "cancelled"]).optional(),
      domain: z.enum(["nutrition", "sleep", "recovery", "effort", "cross_domain", "other"]).nullable().optional(),
      baseline: assistantGoalValueSchema.nullable().optional(),
      target: assistantGoalValueSchema.nullable().optional(),
      horizon: z.object({ targetDate: z.iso.date().nullable().default(null), description: z.string().trim().min(1).max(300).nullable().default(null) }).nullable().optional(),
      cadence: z.record(z.string(), z.unknown()).nullable().optional(),
      constraints: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
      successCriteria: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
    }).refine((changes) => Object.keys(changes).length > 0, "A goal update cannot be empty."),
  })).max(100).default([]),
  addGoals: z.array(assistantGoalInputSchema).max(100).default([]),
  removeGoalIds: z.array(z.uuid()).max(100).default([]),
}).refine((value) => value.primaryDirection !== undefined || value.primaryGoalType !== undefined || value.secondaryDirections !== undefined || value.goalUpdates.length > 0 || value.addGoals.length > 0 || value.removeGoalIds.length > 0, "At least one goal change is required.");

export const assistantPlanSectionSchema = z.object({
  domain: z.enum(["overview", "running", "strength", "nutrition", "sleep", "recovery", "other"]),
  title: z.string().trim().min(1).max(200),
  content: z.array(z.object({
    title: z.string().trim().min(1).max(240), description: z.string().trim().min(1).max(2_000),
    scheduledFor: z.iso.datetime().nullable().default(null),
    successCriteria: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  })).max(200),
});
export const assistantPlanBodySchema = z.object({
  title: z.string().trim().min(1).max(240), objectiveSummary: z.string().trim().min(1).max(2_000),
  phases: z.array(z.object({
    title: z.string().trim().min(1).max(200), description: z.string().trim().min(1).max(2_000),
    startsOn: z.iso.date().nullable().default(null), endsOn: z.iso.date().nullable().default(null),
    transitionCriteria: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  })).max(30),
  detailedThrough: z.iso.date(), reviewOn: z.iso.date(), sections: z.array(assistantPlanSectionSchema).min(1).max(20),
});

export const healthDailyMetricSchema = z.enum([
  "sleep_minutes", "sleep_need_minutes", "sleep_efficiency", "sleep_regularity", "sleep_latency_minutes",
  "sleep_awake_minutes", "sleep_deep_minutes", "sleep_rem_minutes", "daily_sleep_debt_minutes",
  "cumulative_sleep_debt_minutes", "hrv_ms", "resting_heart_rate", "respiratory_rate", "oxygen_saturation",
  "skin_temperature_delta", "steps", "active_energy_kcal", "total_energy_kcal", "zone_minutes", "active_minutes",
  "exercise_minutes", "distance_km", "running_distance_km", "running_duration_minutes", "running_pace_seconds_per_km",
  "running_average_heart_rate", "weight_kg", "body_fat_percent", "vo2_max", "weekly_load", "acute_chronic_load_ratio",
]);
export const nutritionDailyMetricSchema = z.enum([
  "calories_kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g", "added_sugar_g", "meal_count",
  "meal_coverage", "analysis_coverage", "analysis_confidence", "food_variety_count", "food_group_count",
]);

const assistantPeriodSchema = z.object({ from: z.iso.date(), to: z.iso.date() }).refine((value) => value.from <= value.to, {
  message: "The requested period is inverted.", path: ["to"],
});
const paginationSchema = z.object({
  limit: z.number().int().min(1).max(200).default(100), cursor: z.string().max(1_024).nullable().default(null),
  order: z.enum(["asc", "desc"]).default("asc"),
});
export const assistantSemanticQuerySchema = z.discriminatedUnion("dataset", [
  z.object({ dataset: z.literal("daily_health"), period: assistantPeriodSchema, metrics: z.array(healthDailyMetricSchema).min(1).max(20), pagination: paginationSchema.default({ limit: 100, cursor: null, order: "asc" }) }),
  z.object({ dataset: z.literal("scores"), period: assistantPeriodSchema, kinds: z.array(z.enum(["sleep", "recovery", "effort"])).min(1).max(3), pagination: paginationSchema.default({ limit: 100, cursor: null, order: "asc" }) }),
  z.object({ dataset: z.literal("nutrition_daily"), period: assistantPeriodSchema, metrics: z.array(nutritionDailyMetricSchema).min(1).max(13), pagination: paginationSchema.default({ limit: 100, cursor: null, order: "asc" }) }),
  z.object({ dataset: z.literal("activities"), period: assistantPeriodSchema, activityTypes: z.array(z.string().trim().min(1).max(80)).max(20).default([]), pagination: paginationSchema.default({ limit: 100, cursor: null, order: "desc" }) }),
]);
export type AssistantSemanticQuery = z.infer<typeof assistantSemanticQuerySchema>;

export const assistantAvailabilitySchema = z.enum(["observed", "partial", "missing", "not_calculable"]);
export const assistantObservationSchema = z.object({
  metric: z.string().min(1).max(120), value: z.number().finite().nullable(), unit: z.string().max(40).nullable(),
  availability: assistantAvailabilitySchema, coverage: z.number().min(0).max(1), measuredAt: z.iso.datetime().nullable(),
  importedAt: z.iso.datetime().nullable(), freshness: z.enum(["current", "partial", "stale", "missing"]),
  provenance: z.object({ source: z.enum(["confirmed_meals", "health_source", "soma_calculation"]), provider: z.string().max(120).nullable(), algorithmVersion: z.string().max(120).nullable() }),
}).superRefine((value, context) => {
  if ((value.availability === "missing" || value.availability === "not_calculable") && value.value !== null) context.addIssue({ code: "custom", message: "Unavailable observations cannot contain a numeric value.", path: ["value"] });
  if (value.availability === "observed" && value.value === null) context.addIssue({ code: "custom", message: "Observed values must be numeric, including an explicit zero.", path: ["value"] });
  if (value.availability === "missing" && value.coverage !== 0) context.addIssue({ code: "custom", message: "Missing observations must have zero coverage.", path: ["coverage"] });
  if (value.availability === "observed" && value.coverage !== 1) context.addIssue({ code: "custom", message: "Observed values must have complete coverage.", path: ["coverage"] });
  if (value.availability === "missing" && value.freshness !== "missing") context.addIssue({ code: "custom", message: "Missing observations must have missing freshness.", path: ["freshness"] });
});
export const assistantQueryManifestSchema = z.object({
  dataset: z.enum(["daily_health", "scores", "nutrition_daily", "activities"]), requestedPeriod: assistantPeriodSchema,
  coveredPeriod: assistantPeriodSchema.nullable(), timezone: z.string().min(1).max(100), totalItems: z.number().int().nonnegative(),
  returnedItems: z.number().int().nonnegative(), hasMore: z.boolean(), nextCursor: z.string().nullable(), complete: z.boolean(),
  generatedAt: z.iso.datetime(),
}).superRefine((value, context) => {
  if (value.returnedItems > value.totalItems) context.addIssue({ code: "custom", message: "Returned items cannot exceed total items.", path: ["returnedItems"] });
  if (value.complete !== !value.hasMore) context.addIssue({ code: "custom", message: "Completeness must be the inverse of hasMore.", path: ["complete"] });
  if (value.hasMore !== Boolean(value.nextCursor)) context.addIssue({ code: "custom", message: "Pagination cursor must match hasMore.", path: ["nextCursor"] });
});
