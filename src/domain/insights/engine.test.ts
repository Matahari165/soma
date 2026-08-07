import { describe, expect, it } from "vitest";

import { generateHealthInsights } from "./engine";

const series = (baseline: number, recent: number) => Array.from({ length: 20 }, (_, index) => ({
  date: `2026-07-${(index + 1).toString().padStart(2, "0")}`,
  value: index < 17 ? baseline + (index % 3) : recent,
}));

describe("generateHealthInsights", () => {
  it("detects a sustained resting-heart-rate increase", () => {
    const insights = generateHealthInsights({ restingHeartRate: series(55, 65), hrv: series(50, 50), sleepMinutes: series(480, 480) });
    expect(insights.some((insight) => insight.type === "resting_heart_rate_higher")).toBe(true);
  });

  it("does not alert on stable data", () => {
    const stable = series(50, 50);
    expect(generateHealthInsights({ restingHeartRate: stable, hrv: stable, sleepMinutes: stable })).toHaveLength(0);
  });
});
