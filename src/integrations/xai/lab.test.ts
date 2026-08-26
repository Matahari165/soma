import { afterEach, describe, expect, it, vi } from "vitest";

import { generateLabNarrative, labNarrativeSchema } from "./lab";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.XAI_API_KEY;
});

describe("Grok Personal Lab output", () => {
  it("accepts a concise grounded summary", () => {
    const result = labNarrativeSchema.parse({ headline: "More activity is linked to a lower resting heart rate.", summary: "The clearest signal is in the recovery metrics.", highlights: [{ text: "More activity is linked to -2 bpm in resting heart rate.", factIndex: 0 }, { text: "More activity is linked to +4 ms in HRV.", factIndex: 1 }] });
    expect(result.highlights).toHaveLength(2);
  });

  it("uses bounded low-latency reasoning for the dashboard synthesis", async () => {
    process.env.XAI_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      output: [{ content: [{ type: "output_text", text: JSON.stringify({ headline: "Signal", summary: "A clear signal appears in recovery.", highlights: [{ text: "More steps are linked to -3 bpm in resting heart rate.", factIndex: 0 }] }) }] }],
    }), { status: 200 }));

    await generateLabNarrative({ userId: "user-1", relations: [{
      predictorId: "steps",
      predictorLabel: "Pas",
      predictorUnit: "steps",
      predictorKind: "numeric",
      predictorPresentation: "amount",
      predictorLow: 6_000,
      predictorHigh: 9_000,
      predictorDelta: 3_000,
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
      featureEligible: true,
      exclusionReasons: [],
      excluded: false,
    }] });

    const request = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body)) as { reasoning?: { effort?: string }; max_output_tokens?: number; store?: boolean; input?: string; instructions?: string };
    expect(body).toMatchObject({ reasoning: { effort: "low" }, max_output_tokens: 1200, store: false });
    expect(body.input).toContain("qValue");
    expect(body.input).toContain("interval95");
    expect(body.input).toContain("pairedObservations");
    expect(body.input).toContain("analysisPeriod");
    expect(body.input).toContain("lagDays");
    expect(body.input).not.toContain("method");
    expect(body.instructions).toContain("clear, natural English");
    expect(body.instructions).toContain("1 to 4 short effect bullets");
    expect(request?.signal).toBeInstanceOf(AbortSignal);
  });
});
