import { z } from "zod";

import { selectMeaningfulRelations, type MatrixRelation } from "@/domain/lab/matrix";
import { stableHash } from "@/lib/crypto";
import { requireServerEnv } from "@/lib/env";
import { boundedJson, parseXaiUsage } from "./usage";
import { LAB_EDITORIAL_MEMORY } from "./lab-editorial-memory";

export const labNarrativeSchema = z.object({
  headline: z.string().min(1).max(220),
  // Kept for storage/backwards compatibility. The dashboard presents the
  // headline and highlights as the user-facing synthesis.
  summary: z.string().max(360),
  highlights: z.array(z.object({
    label: z.string().min(1).max(100),
    text: z.string().min(1).max(260),
    factIndex: z.number().int().min(0).max(11),
  })).min(1).max(4),
});

export type LabNarrative = z.infer<typeof labNarrativeSchema>;

type EditorialRelation = { predictor: string; outcome: string };
export type LabEvidenceCandidate = {
  predictor: string;
  predictorContrast: { low: number | null; high: number | null; delta: number | null; unit: string; kind: MatrixRelation["predictorKind"]; presentation: MatrixRelation["predictorPresentation"]; label: string };
  outcome: string;
  effect: number;
  detectedShape: MatrixRelation["modelType"];
  nonlinearImprovement: number;
  interval95: [number | null, number | null];
  unit: string;
  timeScale: MatrixRelation["timeScale"];
  period: string;
  analysisPeriod: MatrixRelation["period"];
  lagDays: number;
  timing: string;
  sources: string[];
  pairedObservations: number;
  qValue: number;
  practicalThreshold: number;
  practicalRatio: number;
  habitualVariation: { delta: number; effect: number; unit: string } | null;
  sharedPeriodContrast: { delta: number; effect: number; unit: string } | null;
  previouslyHighlighted: boolean;
};

function sharedContrastFor(relation: MatrixRelation, relations: MatrixRelation[]) {
  if (relation.modelType !== "linear" || relation.predictorDelta === null || relation.predictorDelta === 0 || relation.effect === null) return null;
  const comparable = relations.filter((candidate) => candidate.predictorId === relation.predictorId
    && candidate.outcomeId === relation.outcomeId
    && candidate.lagDays === relation.lagDays
    && candidate.modelType === "linear"
    && candidate.predictorDelta !== null
    && candidate.predictorDelta > 0);
  const reference = comparable.find((candidate) => candidate.period === 30) ?? comparable[0];
  if (!reference?.predictorDelta) return null;
  return {
    delta: reference.predictorDelta,
    effect: relation.effect * reference.predictorDelta / relation.predictorDelta,
    unit: relation.predictorUnit,
  };
}

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
  const eligibleRelations = selectMeaningfulRelations(input.relations, 12)
    .filter((relation) => !relation.excluded && relation.practicallyMeaningful && relation.qValue < 0.05 && relation.effect !== null && relation.coefficient !== null)
    // Keep the mechanically obvious bedtime → total sleep pair out of the
    // model context even if a caller passes a raw, unsorted relation list.
    .filter((relation) => !(relation.predictorId === "bedtime" && relation.outcomeId === "sleep_minutes"));
  const narrativePeriod = eligibleRelations.some((relation) => relation.period === 30) ? 30 : eligibleRelations[0]?.period;
  if (narrativePeriod === undefined) throw new Error("No eligible Personal Lab finding is available for Grok.");
  const usableRelations = eligibleRelations
    .filter((relation) => relation.period === narrativePeriod)
    .sort((first, second) => {
      const liked = (relation: MatrixRelation) => input.likedRelations?.some((item) => item.predictor === relation.predictorLabel && item.outcome === relation.outcomeLabel) ? 0 : 1;
      const seen = (relation: MatrixRelation) => input.previousRelations?.some((item) => item.predictor === relation.predictorLabel && item.outcome === relation.outcomeLabel) ? 1 : 0;
      return liked(first) - liked(second) || seen(first) - seen(second) || (preferredOutcomes.get(first.outcomeId) ?? 50) - (preferredOutcomes.get(second.outcomeId) ?? 50);
    });
  const facts: LabEvidenceCandidate[] = usableRelations.slice(0, 12).map((relation) => ({
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
    effect: relation.effect as number,
    detectedShape: relation.modelType,
    nonlinearImprovement: relation.modelImprovement,
    interval95: [relation.effectConfidenceLow, relation.effectConfidenceHigh],
    unit: relation.outcomeUnit,
    timeScale: relation.timeScale,
    period: relation.period === "all" ? "all history" : `last ${relation.period} days`,
    analysisPeriod: relation.period,
    lagDays: relation.lagDays,
    timing: relation.lagDays === 0
      ? (relation.outcomeId.startsWith("sleep") || ["deep_sleep", "rem_sleep"].includes(relation.outcomeId) ? "same sleep episode" : "same day")
      : relation.lagDays === 1
        ? (relation.outcomeId.startsWith("sleep") || ["deep_sleep", "rem_sleep"].includes(relation.outcomeId) ? "the following night" : "the next day")
        : `${relation.lagDays} days later`,
    sources: relation.sourceEstimates.map((estimate) => estimate.source),
    pairedObservations: relation.sampleSize,
    qValue: relation.qValue,
    practicalThreshold: relation.practicalThreshold,
    practicalRatio: relation.practicalRatio,
    habitualVariation: relation.habitualPredictorDelta === null || relation.habitualEffect === null ? null : { delta: relation.habitualPredictorDelta, effect: relation.habitualEffect, unit: relation.predictorUnit },
    sharedPeriodContrast: sharedContrastFor(relation, usableRelations),
    previouslyHighlighted: input.previousRelations?.some((item) => item.predictor === relation.predictorLabel && item.outcome === relation.outcomeLabel) ?? false,
  }));
  const response = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "grok-4.6",
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 700,
      instructions: [
        "You are Soma's personal health analyst.",
        "The supplied calculations are final: do not recalculate them or infer values that are not supplied.",
        LAB_EDITORIAL_MEMORY,
        "Return the report in English.",
        "Use the window shared by the selected findings; prefer 30-Day when available.",
        "Set summary to an empty string because no narrative summary should be shown.",
        "Return 1 to 4 highlights. Each highlight represents exactly one supplied finding and has label, text, and the zero-based factIndex of that exact finding.",
        "Format text exactly as: <signed predictor contrast and predictor name> ➡️ <signed effect, unit, and outcome name> (<timing>). Example: +100 min Sleep Debt ➡️ -15.6 min REM (same sleep episode).",
        "Preserve supplied effects and units and round only for readable display.",
        "When detectedShape is non-linear, replace the signed predictor contrast with the supplied threshold, plateau, or zone wording. Example: Sleep Debt Plateau (>13h) ➡️ -1.7 bpm Resting Heart Rate (same day). Never describe it as a linear increase or decrease.",
        "Compare the 30-day and 90-day windows only with sharedPeriodContrast, which puts both estimates on the same predictor change. Never compare their raw effects when their raw predictor contrasts differ.",
        "If windows differ, keep each selected finding self-contained and use its supplied period for the heading; do not compare windows unless sharedPeriodContrast supports it.",
        "Repetition is allowed, but prefer a newly available relationship over an equally useful previouslyHighlighted finding.",
        "Do not mention rankings, statistical methods, or technical metadata.",
        "Never mention or explain the distinction between correlation and causation, and do not add a generic statistical caveat.",
        "Do not elevate the obvious bedtime-to-total-sleep relationship. Prefer deep or REM sleep, HRV, resting heart rate, respiration, effort, vigorous-zone minutes, and other activity signals when they are present.",
        "Do not invent mechanisms, context, or data.",
      ].join(" "),
      input: `Anonymous user ${stableHash(input.userId)}\nReport window: ${narrativePeriod === "all" ? "All-Time" : `${narrativePeriod}-Day`}\nCalculated findings:\n${boundedJson(facts)}`,
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
            required: ["label", "text", "factIndex"],
            properties: {
              label: { type: "string", maxLength: 100 },
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
  const result = await response.json() as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; usage?: unknown };
  const text = result.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
  if (!text) throw new Error("Grok returned no Personal Lab summary.");
  const narrative = labNarrativeSchema.parse(JSON.parse(text));
  const highlights = narrative.highlights.filter((highlight) => highlight.factIndex < facts.length);
  if (!highlights.length) throw new Error("Grok returned no grounded Personal Lab insight.");
  const reportWindow = narrativePeriod === "all" ? "All-Time" : `${narrativePeriod}-Day`;
  return { narrative: { ...narrative, headline: reportWindow, summary: "", highlights }, facts, usage: parseXaiUsage(result.usage) };
}
