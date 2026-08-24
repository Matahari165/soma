import { z } from "zod";

import type { MatrixRelation } from "@/domain/lab/matrix";
import { stableHash } from "@/lib/crypto";
import { requireServerEnv } from "@/lib/env";

export const labNarrativeSchema = z.object({
  headline: z.string().min(1).max(220),
  // Kept for storage/backwards compatibility. The dashboard presents the
  // headline and highlights as the user-facing synthesis.
  summary: z.string().min(1).max(360),
  highlights: z.array(z.object({
    text: z.string().min(1).max(260),
    factIndex: z.number().int().min(0).max(11),
  })).min(1).max(4),
});

export type LabNarrative = z.infer<typeof labNarrativeSchema>;

type EditorialRelation = { predictor: string; outcome: string };

export async function generateLabNarrative(input: { userId: string; relations: MatrixRelation[]; likedRelations?: EditorialRelation[]; previousRelations?: EditorialRelation[] }) {
  const apiKey = requireServerEnv("XAI_API_KEY");
  const preferredOutcomes = new Map([
    ["deep_sleep", 0],
    ["rem_sleep", 1],
    ["hrv", 2],
    ["rhr", 3],
    ["respiratory", 4],
    ["vigorous_minutes", 5],
    ["zone_minutes", 6],
    ["active_minutes", 7],
    ["exercise_minutes", 8],
  ]);
  const usableRelations = input.relations
    .filter((relation) => !relation.excluded && relation.featureEligible && relation.qValue < 0.05 && relation.effect !== null && relation.coefficient !== null)
    // Keep the mechanically obvious bedtime → total sleep pair out of the
    // model context even if a caller passes a raw, unsorted relation list.
    .filter((relation) => !(relation.predictorId === "bedtime" && relation.outcomeId === "sleep_minutes"))
    .sort((first, second) => {
      const liked = (relation: MatrixRelation) => input.likedRelations?.some((item) => item.predictor === relation.predictorLabel && item.outcome === relation.outcomeLabel) ? 0 : 1;
      const seen = (relation: MatrixRelation) => input.previousRelations?.some((item) => item.predictor === relation.predictorLabel && item.outcome === relation.outcomeLabel) ? 1 : 0;
      return liked(first) - liked(second) || seen(first) - seen(second) || (preferredOutcomes.get(first.outcomeId) ?? 50) - (preferredOutcomes.get(second.outcomeId) ?? 50);
    });
  const facts = usableRelations.slice(0, 12).map((relation) => ({
    predictor: relation.predictorLabel,
    predictorContrast: {
      low: relation.predictorLow,
      high: relation.predictorHigh,
      delta: relation.predictorDelta,
      unit: relation.predictorUnit,
      kind: relation.predictorKind,
      presentation: relation.predictorPresentation,
      label: relation.comparisonLabel,
    },
    outcome: relation.outcomeLabel,
    effect: relation.effect,
    interval95: [relation.effectConfidenceLow, relation.effectConfidenceHigh],
    unit: relation.outcomeUnit,
    timeScale: relation.timeScale,
    period: relation.period === "all" ? "all history" : `last ${relation.period} days`,
    analysisPeriod: relation.period,
    lagDays: relation.lagDays,
    timing: relation.lagDays === 0
      ? (relation.outcomeId.startsWith("sleep") || ["deep_sleep", "rem_sleep"].includes(relation.outcomeId) ? "that sleep episode" : "same day")
      : relation.lagDays === 1
        ? (relation.outcomeId.startsWith("sleep") || ["deep_sleep", "rem_sleep"].includes(relation.outcomeId) ? "the following night" : "the next day")
        : `${relation.lagDays} days later`,
    sources: relation.sourceEstimates.map((estimate) => estimate.source),
    pairedObservations: relation.sampleSize,
    qValue: relation.qValue,
    previouslyHighlighted: input.previousRelations?.some((item) => item.predictor === relation.predictorLabel && item.outcome === relation.outcomeLabel) ?? false,
  }));
  const response = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "grok-4.6",
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 1200,
      instructions: [
        "You are Soma's personal health analyst.",
        "The supplied calculations are final: do not recalculate them or infer values that are not supplied.",
        "Write in clear, natural English.",
        "Return one short, concrete headline, one brief plain-English summary sentence, and 1 to 4 short effect bullets.",
        "Each bullet must state exactly one observed relationship, name the input and outcome, preserve the supplied effect and unit, explain the supplied predictor contrast in plain language, and include the zero-based factIndex of that exact supplied finding.",
        "Mention the analysis period only when it clarifies a meaningful change between short and long windows.",
        "A short-window decrease may coexist with a flat or beneficial long-window trend; state that distinction when both scales are supplied.",
        "Repetition is allowed, but prefer a newly available relationship over an equally useful previouslyHighlighted finding.",
        "Use simple wording. Never mention rankings, statistical methods, technical metadata, data counts, uncertainty ranges, or how the result was computed.",
        "Never mention or explain the distinction between correlation and causation, and do not add a generic statistical caveat.",
        "Do not elevate the obvious bedtime-to-total-sleep relationship. Prefer deep or REM sleep, HRV, resting heart rate, respiration, effort, vigorous-zone minutes, and other activity signals when they are present.",
        "Do not invent mechanisms, context, or data.",
      ].join(" "),
      input: `Anonymous user ${stableHash(input.userId)}\nCalculated findings:\n${JSON.stringify(facts)}`,
      text: { format: { type: "json_schema", name: "soma_lab_narrative", strict: true, schema: {
        type: "object",
        additionalProperties: false,
        required: ["headline", "summary", "highlights"],
        properties: {
          headline: { type: "string", maxLength: 220 },
          summary: { type: "string", maxLength: 360 },
          highlights: { type: "array", minItems: 1, maxItems: 4, items: {
            type: "object",
            additionalProperties: false,
            required: ["text", "factIndex"],
            properties: {
              text: { type: "string", maxLength: 260 },
              factIndex: { type: "integer", minimum: 0, maximum: 11 },
            },
          } },
        },
      } } },
    }),
    signal: AbortSignal.timeout(40_000),
  });
  if (!response.ok) throw new Error(`Grok request failed with status ${response.status}.`);
  const result = await response.json() as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  const text = result.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
  if (!text) throw new Error("Grok returned no Personal Lab summary.");
  const narrative = labNarrativeSchema.parse(JSON.parse(text));
  const highlights = narrative.highlights.filter((highlight) => highlight.factIndex < facts.length);
  if (!highlights.length) throw new Error("Grok returned no grounded Personal Lab insight.");
  return { narrative: { ...narrative, highlights }, facts };
}
