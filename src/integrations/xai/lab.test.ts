import { afterEach, describe, expect, it, vi } from "vitest";

import type { MatrixRelation } from "@/domain/lab/matrix";
import { generateLabNarrative, labNarrativeSchema } from "./lab";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.XAI_API_KEY;
});

describe("Grok Personal Lab output", () => {
  const highlights = Array.from({ length: 10 }, (_, index) => ({
    label: `Measure ${index + 1}`,
    text: `+${index + 1} measure ➡️ -${index + 1} bpm Resting Heart Rate (next day)`,
    factIndex: index,
  }));

  it("requires ten distinct grounded measures", () => {
    const result = labNarrativeSchema.parse({ headline: "Effort → Heart Rate", period: 30, summary: "", highlights });
    expect(result.highlights).toHaveLength(10);
    expect(() => labNarrativeSchema.parse({ headline: "Effort → Heart Rate", period: 30, summary: "", highlights: highlights.map((item) => ({ ...item, factIndex: 0 })) })).toThrow();
  });

  it("uses bounded low-latency reasoning for the dashboard synthesis", async () => {
    process.env.XAI_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      output: [{ content: [{ type: "output_text", text: JSON.stringify({ headline: "Steps → Heart Rate", period: 90, summary: "", highlights }) }] }],
      usage: { input_tokens: 400, output_tokens: 100, total_tokens: 500, cost_in_usd_ticks: 1400 },
    }), { status: 200 }));

    const relation = {
      predictorId: "steps",
      predictorLabel: "Pas",
      predictorUnit: "steps",
      predictorKind: "numeric",
      predictorPresentation: "amount",
      predictorLow: 6_000,
      predictorHigh: 9_000,
      predictorDelta: 3_000,
      habitualPredictorDelta: 2_000,
      habitualEffect: -2,
      outcomeId: "resting-heart-rate",
      outcomeLabel: "FC repos",
      outcomeUnit: "bpm",
      coefficient: -0.4,
      effect: -3,
      effectConfidenceLow: -4.5,
      effectConfidenceHigh: -1.5,
      percentEffect: -5,
      baselineMean: 60,
      comparisonMean: 57,
      baselineCount: 30,
      comparisonCount: 30,
      comparisonLabel: "+3000 steps",
      sampleSize: 60,
      effectiveSampleSize: 42,
      pValue: 0.01,
      qValue: 0.03,
      confidenceLow: -0.6,
      confidenceHigh: -0.2,
      relevance: 0.8,
      lagDays: 1,
      grain: "day",
      timeScale: "acute",
      period: 30,
      family: "automatic-acute",
      method: "raw-within-person-hac",
      evidence: "established",
      stable: true,
      stability: { chronologicalBlocks: 4, directionHeldInBlocks: true, trendAdjustedDirectionHeld: true, outlierAdjustedDirectionHeld: true },
      strength: "clear",
      coverageBySource: [{ source: "Fitbit", pairedDays: 60, pairedWeeks: 0 }],
      sourceEstimates: [{ source: "Fitbit", sampleSize: 60, effect: -3, effectConfidenceLow: -4.5, effectConfidenceHigh: -1.5, coefficient: -0.4, pValue: 0.01 }],
      doseResponse: null,
      modelType: "linear",
      modelImprovement: 0,
      nonlinearTested: true,
      practicallyMeaningful: true,
      practicalThreshold: 1,
      practicalRatio: 3,
      featureEligible: true,
      exclusionReasons: [],
      excluded: false,
    } satisfies MatrixRelation;
    const generated = await generateLabNarrative({
      userId: "user-1",
      relations: Array.from({ length: 10 }, (_, index) => ({
        ...relation,
        predictorId: `steps-${index}`,
        predictorLabel: `Steps ${index + 1}`,
        period: 90 as const,
      })),
    });

    const request = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body)) as { reasoning?: { effort?: string }; max_output_tokens?: number; store?: boolean; input?: string; instructions?: string };
    expect(body).toMatchObject({ reasoning: { effort: "low" }, max_output_tokens: 1_600, store: false });
    expect(body.input).toContain("qValue");
    expect(body.input).toContain("Available report windows: 90 days");
    expect(body.input).not.toContain('"truncated":true');
    expect(body.input).toContain("interval95");
    expect(body.input).toContain("pairedObservations");
    expect(body.input).toContain("analysisPeriod");
    expect(body.input).toContain("lagDays");
    expect(body.input).toContain("habitualVariation");
    expect(body.input).toContain("sharedPeriodContrast");
    expect(body.input).not.toContain("method");
    expect(body.instructions).toContain("compact metric report");
    expect(body.instructions).toContain("<predictor emoji> <short predictor name> vs. <outcome emoji> <short outcome name>");
    expect(body.instructions).toContain("➡️");
    expect(request?.signal).toBeInstanceOf(AbortSignal);
    expect(generated.narrative).toMatchObject({ headline: "Steps 1 → FC repos · Steps 2 → FC repos — 90 days", period: 90, summary: "" });
    expect(generated.usage).toEqual({ input_tokens: 400, output_tokens: 100, total_tokens: 500, cost_in_usd_ticks: 1400 });
    expect(generated.facts).toHaveLength(10);
  });
});
