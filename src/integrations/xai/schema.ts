import { z } from "zod";

export const coachActionSchema = z.object({
  type: z.enum(["update_sleep_target", "update_primary_goal", "customize_dashboard"]),
  title: z.string().min(1).max(160),
  description: z.string().min(1).max(1000),
  payload: z.object({
    programName: z.string().max(120).nullable(),
    exerciseNames: z.array(z.string().max(120)).max(20),
    sleepTargetMinutes: z.number().int().min(240).max(720).nullable(),
    goal: z.enum(["build_muscle", "improve_endurance", "improve_cardio", "general_fitness", "maintain_health", "other"]).nullable(),
    widgetId: z.string().max(80).nullable(),
    visible: z.boolean().nullable(),
  }),
});

export const coachResponseSchema = z.object({
  answer: z.string().min(1).max(8000),
  evidence: z.array(z.string().max(300)).max(5),
  proposedAction: coachActionSchema.nullable(),
});
