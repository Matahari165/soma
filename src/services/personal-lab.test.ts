import { describe, expect, it } from "vitest";

import { analysisWindowForPeriods, hasReliableOvernightData, isImpossibleSameDayTiming, isMechanicalRelation, labMatrixCacheKey, latestLabDate, overnightFingerprint, recentAverages, timingForAutomaticMetric } from "./personal-lab";
import type { LabObservation } from "@/domain/lab/observation";

describe("Personal Lab analysis window", () => {
  const now = new Date("2026-08-25T12:00:00.000Z");

  it("loads only the days required by a bounded period plus relation lags", () => {
    expect(analysisWindowForPeriods([30], now)).toEqual({ start: "2026-07-25", days: 32 });
    expect(analysisWindowForPeriods([15, 90], now)).toEqual({ start: "2026-05-26", days: 92 });
  });

  it("keeps all history available when the all-history period is requested", () => {
    expect(analysisWindowForPeriods(["all"], now)).toBeNull();
    expect(analysisWindowForPeriods(undefined, now)).toBeNull();
  });

  it("caches exact single-period matrices without combining oversized payloads", () => {
    expect(labMatrixCacheKey([30])).toBe("30");
    expect(labMatrixCacheKey(["all"])).toBe("all");
    expect(labMatrixCacheKey([30, 90])).toBeNull();
    expect(labMatrixCacheKey(undefined)).toBeNull();
  });

  it("anchors periods to the latest available date regardless of query ordering", () => {
    expect(latestLabDate(["2026-08-25", "2026-08-24", "2026-07-25"], [], "2026-01-01")).toBe("2026-08-25");
    expect(latestLabDate(["2026-07-25", "2026-08-24", "2026-08-25"], [], "2026-01-01")).toBe("2026-08-25");
    expect(latestLabDate([], ["2026-08-23", "2026-08-25"], "2026-01-01")).toBe("2026-08-25");
  });
});

describe("Personal Lab morning readiness", () => {
  it("waits for a complete sleep interval and a detailed overnight metric", () => {
    expect(hasReliableOvernightData({ sleep_minutes: 500, bedtime: null, wake_time: null })).toBe(false);
    expect(hasReliableOvernightData({ sleep_minutes: 500, bedtime: "2026-08-24T22:30:00Z", wake_time: "2026-08-25T07:00:00Z" })).toBe(false);
  });

  it("accepts the overnight snapshot once one detailed metric is available", () => {
    expect(hasReliableOvernightData({ sleep_minutes: 500, bedtime: "2026-08-24T22:30:00Z", wake_time: "2026-08-25T07:00:00Z", hrv_ms: 44 })).toBe(true);
  });

  it("fingerprints overnight values without reacting to daytime activity", () => {
    const base = { sleep_minutes: 500, bedtime: "2026-08-24T22:30:00Z", wake_time: "2026-08-25T07:00:00Z", hrv_ms: 44, steps: 1000 };
    expect(overnightFingerprint({ ...base, steps: 9000 })).toBe(overnightFingerprint(base));
    expect(overnightFingerprint({ ...base, hrv_ms: 48 })).not.toBe(overnightFingerprint(base));
  });
});

describe("Personal Lab timing", () => {
  it("rejects daytime and journal predictors against overnight outcomes that already happened", () => {
    expect(isImpossibleSameDayTiming("daytime", "sleep_minutes", 0)).toBe(true);
    expect(isImpossibleSameDayTiming("journal", "hrv", 0)).toBe(true);
    expect(isImpossibleSameDayTiming("daytime", "sleep_minutes", 1)).toBe(false);
  });

  it("keeps genuinely same-episode and same-day comparisons", () => {
    expect(isImpossibleSameDayTiming("overnight", "sleep_minutes", 0)).toBe(false);
    expect(isImpossibleSameDayTiming("daytime", "effort", 0)).toBe(false);
  });

  it("classifies optional activity metrics as daytime and optional sleep metrics as overnight", () => {
    expect(timingForAutomaticMetric("active_energy")).toBe("daytime");
    expect(timingForAutomaticMetric("distance")).toBe("daytime");
    expect(timingForAutomaticMetric("night_temperature")).toBe("overnight");
    expect(isImpossibleSameDayTiming(timingForAutomaticMetric("active_energy"), "bedtime", 0)).toBe(true);
  });
});

describe("Personal Lab mechanical exclusions", () => {
  it("keeps informative sleep-component relationships while excluding direct score inputs", () => {
    expect(isMechanicalRelation("sleep_minutes", "deep_sleep")).toBe(false);
    expect(isMechanicalRelation("sleep_efficiency", "rem_sleep")).toBe(false);
    expect(isMechanicalRelation("sleep_minutes", "sleep_debt")).toBe(true);
    expect(isMechanicalRelation("steps", "effort")).toBe(true);
    expect(isMechanicalRelation("hrv", "recovery")).toBe(true);
  });
});

describe("Personal Lab 30-day signal averages", () => {
  const observation = (date: string, values: Partial<LabObservation>): LabObservation => ({
    date,
    sleepMinutes: null,
    sleepEfficiency: null,
    sleepRegularity: null,
    sleepDebtMinutes: null,
    hrv: null,
    restingHeartRate: null,
    recoveryScore: null,
    effortScore: null,
    steps: null,
    zoneMinutes: null,
    deepWorkMinutes: null,
    energy: null,
    focus: null,
    stress: null,
    mood: null,
    soreness: null,
    caffeine: null,
    alcohol: null,
    lateMeal: null,
    illness: null,
    ...values,
  });

  it("uses an inclusive 30-day window and excludes missing values", () => {
    expect(recentAverages([
      observation("2026-07-26", { sleepMinutes: 100, recoveryScore: 10, effortScore: 1 }),
      observation("2026-07-27", { sleepMinutes: 400, recoveryScore: 40, effortScore: 4 }),
      observation("2026-08-25", { sleepMinutes: 500, recoveryScore: 60, effortScore: 6 }),
    ], "2026-08-25")).toEqual({ averageSleepMinutes: 450, averageSleepRegularity: null, averageRecoveryScore: 50, averageEffortScore: 5 });
  });
});
