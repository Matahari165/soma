import { describe, expect, it } from "vitest";

import { compactHealthContext } from "./coach-context";

describe("bounded Coach health context", () => {
  it("exposes today plus 7 and 30 day averages without raw history", () => {
    const metrics = Array.from({ length: 30 }, (_, index) => ({ metric_date: `2026-08-${String(30 - index).padStart(2, "0")}`, sleep_minutes: 400 + index, hrv_ms: 50 + index }));
    const scores = Array.from({ length: 30 }, (_, index) => ({ score_date: metrics[index].metric_date, kind: "recovery", score: 60 + index }));
    const context = compactHealthContext(metrics, scores);
    expect(context.today["sleep_minutes"]).toBe(400);
    expect(context.averages7d["sleep_minutes"]).toBe(403);
    expect(context.averages30d["hrv_ms"]).toBe(64.5);
    expect(context).not.toHaveProperty("metrics");
  });
});
