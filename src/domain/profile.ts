import { z } from "zod";

export const fitnessGoalSchema = z.enum([
  "build_muscle",
  "improve_endurance",
  "improve_cardio",
  "general_fitness",
  "maintain_health",
  "other",
]);

export const onboardingSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  dateOfBirth: z.iso.date(),
  heightCm: z.number().min(50).max(260),
  weightKg: z.number().min(20).max(400),
  sexForHealthCalculations: z.enum(["female", "male", "intersex", "prefer_not_to_say"]),
  primaryGoal: fitnessGoalSchema,
  secondaryGoal: fitnessGoalSchema.nullable(),
  baseSleepTargetMinutes: z.number().int().min(240).max(720),
  usualWakeTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  importRange: z.enum(["90_days", "all_history"]),
  timezone: z.string().min(1).max(80),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const goalLabels: Record<z.infer<typeof fitnessGoalSchema>, string> = {
  build_muscle: "Build muscle",
  improve_endurance: "Improve endurance",
  improve_cardio: "Improve cardiovascular fitness",
  general_fitness: "Improve general fitness",
  maintain_health: "Maintain health",
  other: "Other",
};
