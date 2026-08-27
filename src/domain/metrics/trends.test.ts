import { describe, expect, it } from "vitest";

import { summarizeTrend } from "./trends";
import { acuteChronicLoadRatio, activityRegularity, calculateSleepDebt, completedActivityDays, isActiveDay } from "./wellness";

describe("metric trends", () => {
  it("compares the latest value with prior 7, 30 and 90 day baselines", () => {
    const points = Array.from({ length: 10 }, (_, index) => ({ date: `2026-08-${String(index + 1).padStart(2, "0")}`, value: index + 1 }));
    const summary = summarizeTrend(points, "higher_is_better");
    expect(summary.current).toBe(10);
    expect(summary.comparisons[0]).toMatchObject({ days: 7, average: 6, absoluteDelta: 4, sampleSize: 7 });
  });

  it("uses 90 prior values when the current value is also present", () => {
    const points = Array.from({ length: 91 }, (_, index) => ({ date: new Date(Date.UTC(2026, 4, index + 1)).toISOString().slice(0, 10), value: index + 1 }));
    const summary = summarizeTrend(points, "context_only");

    expect(summary.comparisons.find((comparison) => comparison.days === 90)?.sampleSize).toBe(90);
  });

  it("uses calendar days instead of a fixed number of readings", () => {
    const summary = summarizeTrend([
      { date: "2026-08-01", value: 10 },
      { date: "2026-08-10", value: 20 },
      { date: "2026-08-20", value: 30 },
    ], "higher_is_better");
    expect(summary.comparisons[0]).toMatchObject({ days: 7, average: null, sampleSize: 0 });
    expect(summary.comparisons[1]).toMatchObject({ days: 30, average: 15, sampleSize: 2 });
    expect(summary.currentDate).toBe("2026-08-20");
  });
});

describe("wellness calculations", () => {
  it("lets later sleep surplus repay rolling debt", () => {
    const result = calculateSleepDebt([
      { date: "2026-08-01", targetMinutes: 480, actualMinutes: 420 },
      { date: "2026-08-02", targetMinutes: 480, actualMinutes: 510 },
    ]);
    expect(result[0].cumulativeDebtMinutes).toBe(60);
    expect(result[1].dailyDebtMinutes).toBe(-30);
    expect(result[1].cumulativeDebtMinutes).toBe(30);
  });

  it("uses the approved active-day definition", () => {
    expect(isActiveDay({ steps: 7_500, activeZoneMinutes: 0, activeMinutes: 0 })).toBe(true);
    expect(isActiveDay({ steps: 2_000, activeZoneMinutes: 20, activeMinutes: 0 })).toBe(true);
    expect(isActiveDay({ steps: 2_000, activeZoneMinutes: 0, activeMinutes: 30 })).toBe(true);
    expect(isActiveDay({ steps: 7_499, activeZoneMinutes: 19, activeMinutes: 29 })).toBe(false);
    expect(isActiveDay({ steps: null, activeZoneMinutes: null, activeMinutes: null })).toBeNull();
  });

  it("calculates active and inactive days without treating missing days as inactive", () => {
    const result = activityRegularity([
      { steps: 8_000, activeZoneMinutes: 10, activeMinutes: 10, effortScore: 55 },
      { steps: 3_000, activeZoneMinutes: 5, activeMinutes: 15, effortScore: 25 },
      { steps: null, activeZoneMinutes: null, activeMinutes: null, effortScore: null },
    ]);
    expect(result).toMatchObject({ observedDays: 2, activeDays: 1, inactiveDays: 1, activeDayRate: 50 });
  });

  it("calculates recent load against the weekly average of available habitual load", () => {
    expect(acuteChronicLoadRatio(Array.from({ length: 28 }, () => 50))).toBe(1);
    expect(acuteChronicLoadRatio(Array.from({ length: 20 }, () => 50))).toBeNull();
  });

  it("excludes the partial current day while preserving a measured zero", () => {
    const result = completedActivityDays([
      { metric_date: "2026-08-06", steps: null, zone_minutes: null, active_minutes: null, active_energy_kcal: null, exercise_minutes: null },
      { metric_date: "2026-08-07", steps: 0, zone_minutes: 0, active_minutes: 0, active_energy_kcal: 0, exercise_minutes: 0 },
      { metric_date: "2026-08-08", steps: 4_000, zone_minutes: 8, active_minutes: 20, active_energy_kcal: 240, exercise_minutes: 0 },
    ], "2026-08-08");

    expect(result.map((day) => day.metric_date)).toEqual(["2026-08-07"]);
  });
});
