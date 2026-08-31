import { z } from "zod";

import { selectMeaningfulRelations, type MatrixRelation } from "@/domain/lab/matrix";
import { stableHash } from "@/lib/crypto";
import { requireServerEnv } from "@/lib/env";
import { boundedJson, parseXaiUsage } from "./usage";
import { LAB_EDITORIAL_MEMORY } from "./lab-editorial-memory";
import { LAB_NARRATIVE_ITEM_COUNT } from "@/services/lab-narrative-policy";

export const labNarrativeSchema = z.object({
  headline: z.string().min(1).max(220),
  period: z.union([z.literal(30), z.literal(90)]),
  // Kept for storage/backwards compatibility. The dashboard presents the
  // headline and highlights as the user-facing synthesis.
  summary: z.string().max(360),
  highlights: z.array(z.object({
    label: z.string().min(1).max(100),
    text: z.string().min(1).max(260),
    factIndex: z.number().int().min(0).max(19),
  })).length(LAB_NARRATIVE_ITEM_COUNT),
}).superRefine((narrative, context) => {
  if (new Set(narrative.highlights.map((highlight) => highlight.factIndex)).size !== LAB_NARRATIVE_ITEM_COUNT) {
    context.addIssue({ code: "custom", path: ["highlights"], message: "Weekly measures must reference ten distinct findings." });
  }
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

function insightHeadline(facts: LabEvidenceCandidate[], highlights: LabNarrative["highlights"], period: 30 | 90) {
  const pairs = highlights.flatMap((highlight) => {
    const fact = facts[highlight.factIndex];
    return fact ? [`${fact.predictor} → ${fact.outcome}`] : [];
  });
  const mainPairs = [...new Set(pairs)].slice(0, 2);
  return `${mainPairs.join(" · ")} — ${period} days`;
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
  const eligibleRelations = selectMeaningfulRelations(input.relations, 24)
    .filter((relation) => !relation.excluded && relation.practicallyMeaningful && relation.qValue < 0.05 && relation.effect !== null && relation.coefficient !== null)
    .filter((relation) => relation.period === 30 || relation.period === 90)
    // Keep the mechanically obvious bedtime → total sleep pair out of the
    // model context even if a caller passes a raw, unsorted relation list.
    .filter((relation) => !(relation.predictorId === "bedtime" && relation.outcomeId === "sleep_minutes"));
  if (!eligibleRelations.length) throw new Error("No eligible Personal Lab finding is available for Grok.");
  const availablePeriods = ([30, 90] as const).filter((period) => eligibleRelations.filter((relation) => relation.period === period).length >= LAB_NARRATIVE_ITEM_COUNT);
  if (!availablePeriods.length) throw new Error("Ten eligible Personal Lab findings are required for Grok.");
  const editorialSort = (first: MatrixRelation, second: MatrixRelation) => {
      const liked = (relation: MatrixRelation) => input.likedRelations?.some((item) => item.predictor === relation.predictorLabel && item.outcome === relation.outcomeLabel) ? 0 : 1;
      const seen = (relation: MatrixRelation) => input.previousRelations?.some((item) => item.predictor === relation.predictorLabel && item.outcome === relation.outcomeLabel) ? 1 : 0;
      return liked(first) - liked(second) || seen(first) - seen(second) || (preferredOutcomes.get(first.outcomeId) ?? 50) - (preferredOutcomes.get(second.outcomeId) ?? 50);
  };
  const usableRelations = availablePeriods.flatMap((period) => eligibleRelations.filter((relation) => relation.period === period).sort(editorialSort).slice(0, LAB_NARRATIVE_ITEM_COUNT));
  const facts: LabEvidenceCandidate[] = usableRelations.map((relation) => ({
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
      max_output_tokens: 1_600,
      instructions: [
        "You are Soma's personal health analyst.",
        "The supplied calculations are final: do not recalculate them or infer values that are not supplied.",
        LAB_EDITORIAL_MEMORY,
        "Return the report in English.",
        "Choose one of the available periods according to which window offers the strongest, most coherent and most useful set of findings. Do not automatically prefer 30 days.",
        "Set summary to an empty string because no narrative summary should be shown.",
        "Return exactly 10 highlights from the chosen period only. Use ten distinct supplied findings, ordered from most important to least important. Each highlight has label, text, and the zero-based factIndex of that exact finding.",
        "Set headline to a short topic preview using arrows, such as Effort → REM · Steps → HRV. Do not include the period in headline; Soma appends it.",
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
      input: `Anonymous user ${stableHash(input.userId)}\nAvailable report windows: ${availablePeriods.map((period) => `${period} days`).join(" and ")}\nCalculated findings:\n${boundedJson(facts, 40_000)}`,
      text: { format: { type: "json_schema", name: "soma_lab_narrative", strict: true, schema: {
        type: "object",
        additionalProperties: false,
        required: ["headline", "period", "summary", "highlights"],
        properties: {
          headline: { type: "string", maxLength: 220 },
          period: { type: "integer", enum: [30, 90] },
          summary: { type: "string", maxLength: 360 },
          highlights: { type: "array", minItems: LAB_NARRATIVE_ITEM_COUNT, maxItems: LAB_NARRATIVE_ITEM_COUNT, items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "text", "factIndex"],
            properties: {
              label: { type: "string", maxLength: 100 },
              text: { type: "string", maxLength: 260 },
              factIndex: { type: "integer", minimum: 0, maximum: 19 },
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
  const highlights = narrative.highlights.filter((highlight) => highlight.factIndex < facts.length && facts[highlight.factIndex]?.analysisPeriod === narrative.period);
  if (!highlights.length) throw new Error("Grok returned no grounded Personal Lab insight.");
  return { narrative: { ...narrative, headline: insightHeadline(facts, highlights, narrative.period), summary: "", highlights }, facts, usage: parseXaiUsage(result.usage) };
}
