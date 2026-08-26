import { afterEach, describe, expect, it, vi } from "vitest";

import { askSomaCoach } from "./coach";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.XAI_API_KEY;
});

describe("Soma Coach xAI budget", () => {
  it("bounds reasoning, output, context and persists exact usage", async () => {
    process.env.XAI_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      output: [{ content: [{ type: "output_text", text: JSON.stringify({ answer: "Your 30-day HRV is above the 7-day average.", evidence: ["HRV averages"], proposedAction: null }) }] }],
      usage: { input_tokens: 300, output_tokens: 80, total_tokens: 380, cost_in_usd_ticks: 1080 },
    }), { status: 200 }));

    const result = await askSomaCoach({ userId: "user-1", message: "What changed?", context: { digest: "x".repeat(20_000) } });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { reasoning: { effort: string }; max_output_tokens: number; store: boolean; input: string; tools?: unknown };
    expect(body).toMatchObject({ reasoning: { effort: "low" }, max_output_tokens: 700, store: false });
    expect(body.tools).toBeUndefined();
    expect(body.input.length).toBeLessThan(12_200);
    expect(result.usage.cost_in_usd_ticks).toBe(1080);
  });
});
