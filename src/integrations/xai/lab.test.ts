import { afterEach, describe, expect, it, vi } from "vitest";

import { generateLabNarrative, labNarrativeSchema } from "./lab";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.XAI_API_KEY;
});

describe("Grok Personal Lab output", () => {
  it("accepts a concise grounded summary", () => {
    const result = labNarrativeSchema.parse({ headline: "More activity is linked to a lower resting heart rate.", summary: "The clearest signal is in the recovery metrics.", highlights: ["More activity is linked to -2 bpm in resting heart rate.", "More activity is linked to +4 ms in HRV."] });
    expect(result.highlights).toHaveLength(2);
  });

  it("uses bounded low-latency reasoning for the dashboard synthesis", async () => {
    process.env.XAI_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      output: [{ content: [{ type: "output_text", text: JSON.stringify({ headline: "Signal", summary: "A clear signal appears in recovery.", highlights: ["More steps are linked to -3 bpm in resting heart rate.", "More steps are linked to +4 ms in HRV."] }) }] }],
    }), { status: 200 }));

    await generateLabNarrative({ userId: "user-1", relations: [{
      predictorId: "steps",
      predictorLabel: "Pas",
      outcomeId: "resting-heart-rate",
      outcomeLabel: "FC repos",
      outcomeUnit: "bpm",
      coefficient: -0.4,
      effect: -3,
      sampleSize: 60,
      effectiveSampleSize: 42,
      pValue: 0.01,
      qValue: 0.03,
      confidenceLow: -0.6,
      confidenceHigh: -0.2,
      relevance: 0.8,
      lagDays: 1,
      method: "spearman",
      evidence: "established",
      stable: true,
      strength: "clear",
      excluded: false,
    }] });

    const request = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body)) as { reasoning?: { effort?: string }; max_output_tokens?: number; store?: boolean; input?: string; instructions?: string };
    expect(body).toMatchObject({ reasoning: { effort: "low" }, max_output_tokens: 1200, store: false });
    expect(body.input).not.toContain("qValue");
    expect(body.input).not.toContain("confidenceLow");
    expect(body.input).not.toContain("sampleSize");
    expect(body.input).not.toContain("method");
    expect(body.instructions).toContain("clear, natural English");
    expect(body.instructions).toContain("1 to 4 short effect bullets");
    expect(request?.signal).toBeInstanceOf(AbortSignal);
  });
});
