import { describe, expect, it } from "vitest";

import { boundedJson, parseXaiUsage } from "./usage";

describe("xAI request accounting", () => {
  it("keeps oversized context valid JSON and below the hard limit", () => {
    const serialized = boundedJson({ messages: ["x".repeat(20_000)] });
    expect(serialized.length).toBeLessThanOrEqual(12_000);
    expect(JSON.parse(serialized)).toMatchObject({ truncated: true });
  });

  it("keeps the exact usage counters returned by xAI", () => {
    expect(parseXaiUsage({ input_tokens: 10, output_tokens: 20, total_tokens: 30, cost_in_usd_ticks: 140 })).toEqual({
      input_tokens: 10, output_tokens: 20, total_tokens: 30, cost_in_usd_ticks: 140,
    });
  });
});
