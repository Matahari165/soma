import { coachResponseSchema } from "@/integrations/xai/schema";
import { stableHash } from "@/lib/crypto";
import { requireServerEnv } from "@/lib/env";
import { boundedJson, parseXaiUsage } from "./usage";

export type CoachAction = {
  type: "update_sleep_target" | "update_primary_goal" | "customize_dashboard";
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
      reasoning: { effort: "low" },
      max_output_tokens: 700,
      instructions: "You are Soma Coach, a concise personal-wellness analyst. Use only the supplied daily digest, today's values, 7/30-day averages, and recent messages. Small comparisons and synthesis are allowed. Never recalculate statistics, infer physiological mechanisms, give generic advice, request tools, or claim access to raw history. State missing data plainly. Never mention or explain the distinction between correlation and causation. Always answer in clear, concise English. Any request that changes app data must return a proposedAction for user confirmation and must not claim it was executed.",
      input: `Anonymous user ${stableHash(input.userId)}\n\nSoma context:\n${boundedJson(input.context)}\n\nUser message:\n${input.message}`,
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
                      type: { type: "string", enum: ["update_sleep_target", "update_primary_goal", "customize_dashboard"] },
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
    signal: AbortSignal.timeout(40_000),
  });
  if (!response.ok) throw new Error(`Grok request failed with status ${response.status}.`);
  const result = await response.json() as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; usage?: unknown };
  const text = result.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
  if (!text) throw new Error("Soma Coach returned no structured response.");
  const parsed = coachResponseSchema.parse(JSON.parse(text)) as { answer: string; evidence: string[]; proposedAction: CoachAction | null };
  return { ...parsed, usage: parseXaiUsage(result.usage) };
}
