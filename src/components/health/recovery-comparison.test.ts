import { describe, expect, it } from "vitest";

import type { ScoreDay } from "@/services/health-analytics";

import { averageLast30RecoveryDriver, averageLast30Scores, compareRecoveryValue } from "./recovery-comparison";

const scores: ScoreDay[] = [
  { score_date: "2026-08-31", kind: "recovery", score: 99, drivers: { hrv: 99 } },
  { score_date: "2026-09-01", kind: "recovery", score: 50, drivers: { hrv: 48 } },
  { score_date: "2026-09-15", kind: "recovery", score: null, drivers: { hrv: null } },
  { score_date: "2026-09-30", kind: "recovery", score: 70, drivers: { hrv: 52 } },
  { score_date: "2026-09-30", kind: "sleep", score: 80, drivers: {} },
];

describe("recovery comparisons", () => {
  it("averages the selected score and normalized driver in the inclusive 30-day window", () => {
    expect(averageLast30Scores(scores, "recovery", "2026-09-30")).toEqual({ value: 60, count: 2 });
    expect(averageLast30RecoveryDriver(scores, "hrv", "2026-09-30")).toEqual({ value: 50, count: 2 });
    expect(averageLast30RecoveryDriver(scores, "hrv", "invalid")).toEqual({ value: null, count: 0 });
  });

  it("compares component scores to component scores and raw HRV cautiously", () => {
    expect(compareRecoveryValue(54, { value: 50 }, "higher", 0, true)).toMatchObject({ tone: "positive", deltaLabel: "+4", interpretation: "tends favorable" });
    expect(compareRecoveryValue(64, { value: 60 }, "lower")).toMatchObject({ tone: "negative", deltaLabel: "+4", interpretation: "unfavorable" });
  });

  it("keeps contextual, equal, and unmeasured comparisons neutral", () => {
    expect(compareRecoveryValue(17.8, { value: 17.3 }, "context", 1)).toMatchObject({ tone: "neutral", deltaLabel: "+0.5", interpretation: null });
    expect(compareRecoveryValue(58, { value: 58.4 }, "higher")).toMatchObject({ tone: "neutral", deltaLabel: "±0", interpretation: "stable" });
    expect(compareRecoveryValue(17, { value: null }, "higher")).toMatchObject({ tone: "neutral", deltaLabel: null, description: "30-day comparison unavailable" });
  });
});
