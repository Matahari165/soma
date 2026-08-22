import { coachResponseSchema } from "@/integrations/xai/schema";
import { stableHash } from "@/lib/crypto";
import { requireServerEnv } from "@/lib/env";

export type CoachAction = {
  type: "create_workout_program" | "update_sleep_target" | "update_primary_goal" | "customize_dashboard";
  title: string;
  description: string;
  payload: { programName: string | null; exerciseNames: string[]; sleepTargetMinutes: number | null; goal: string | null; widgetId: string | null; visible: boolean | null };
};

export async function askSomaCoach(input: { userId: string; message: string; context: unknown }) {
  const apiKey = requireServerEnv("XAI_API_KEY");
  const response = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "grok-4.6",
      store: false,
      instructions: "You are Soma Coach, a concise personal-wellness analyst. Use only the supplied Soma metrics, state missing data, and do not infer mechanisms beyond the measurements. Never mention or explain the distinction between correlation and causation, and never add a generic warning about it; the user already knows it. Answer in the user's language. Read requests can be answered directly. Any request that changes app data must return a proposedAction for user confirmation and must not claim it was executed.",
      input: `Anonymous user ${stableHash(input.userId)}\n\nSoma context:\n${JSON.stringify(input.context)}\n\nUser message:\n${input.message}`,
      text: {
        format: {
          type: "json_schema",
          name: "soma_coach_response",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["answer", "evidence", "proposedAction"],
            properties: {
              answer: { type: "string" },
              evidence: { type: "array", items: { type: "string" }, maxItems: 5 },
              proposedAction: {
                anyOf: [
                  { type: "null" },
                  {
                    type: "object",
                    additionalProperties: false,
                    required: ["type", "title", "description", "payload"],
                    properties: {
                      type: { type: "string", enum: ["create_workout_program", "update_sleep_target", "update_primary_goal", "customize_dashboard"] },
                      title: { type: "string" },
                      description: { type: "string" },
                      payload: {
                        type: "object",
                        additionalProperties: false,
                        required: ["programName", "exerciseNames", "sleepTargetMinutes", "goal", "widgetId", "visible"],
                        properties: {
                          programName: { type: ["string", "null"] },
                          exerciseNames: { type: "array", items: { type: "string" }, maxItems: 20 },
                          sleepTargetMinutes: { type: ["integer", "null"], minimum: 240, maximum: 720 },
                          goal: { type: ["string", "null"], enum: ["build_muscle", "improve_endurance", "improve_cardio", "general_fitness", "maintain_health", "other", null] },
                          widgetId: { type: ["string", "null"] },
                          visible: { type: ["boolean", "null"] },
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`Grok request failed with status ${response.status}.`);
  const result = await response.json() as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  const text = result.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
  if (!text) throw new Error("Soma Coach returned no structured response.");
  return coachResponseSchema.parse(JSON.parse(text)) as { answer: string; evidence: string[]; proposedAction: CoachAction | null };
}
