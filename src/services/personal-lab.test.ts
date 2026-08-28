import { describe, expect, it, vi } from "vitest";

import { analysisWindowForPeriods, createPersonalLabStream, hasReliableActivityCoverage, hasReliableOvernightData, isImpossibleSameDayTiming, isMechanicalRelation, labMatrixCacheKey, latestLabDate, overnightFingerprint, recentAverages, runningDaySeries, timingForAutomaticMetric } from "./personal-lab";
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
    expect(isMechanicalRelation("sleep_minutes", "deep_sleep")).toBe(true);
    expect(isMechanicalRelation("sleep_efficiency", "rem_sleep")).toBe(false);
    expect(isMechanicalRelation("sleep_minutes", "sleep_debt")).toBe(true);
    expect(isMechanicalRelation("steps", "effort")).toBe(true);
    expect(isMechanicalRelation("hrv", "recovery")).toBe(true);
    expect(isMechanicalRelation("bedtime", "sleep_minutes")).toBe(true);
    expect(isMechanicalRelation("bedtime", "sleep_efficiency")).toBe(true);
    expect(isMechanicalRelation("wake_time", "sleep_minutes")).toBe(true);
    expect(isMechanicalRelation("wake_time", "sleep_efficiency")).toBe(true);
    expect(isMechanicalRelation("wake_time", "sleep_awake")).toBe(true);
    expect(isMechanicalRelation("wake_time", "sleep_fragmentation")).toBe(false);
    expect(isMechanicalRelation("bedtime", "deep_sleep")).toBe(false);
    expect(isMechanicalRelation("wake_time", "rem_sleep")).toBe(false);
    expect(isMechanicalRelation("sleep_debt", "rem_sleep")).toBe(true);
    expect(isMechanicalRelation("sleep_debt", "rem_sleep", 1)).toBe(false);
    expect(isMechanicalRelation("sleep_debt", "rem_sleep", 2)).toBe(true);
    expect(isMechanicalRelation("sleep_debt", "sleep_minutes", 1)).toBe(false);
    expect(isMechanicalRelation("effort", "steps", 1)).toBe(true);
    expect(isMechanicalRelation("wake_time", "sleep_minutes", 1)).toBe(false);
  });

  it("excludes same-night sleep composition but keeps next-day sleep effects", () => {
    expect(isMechanicalRelation("sleep_minutes", "deep_sleep", 0)).toBe(true);
    expect(isMechanicalRelation("sleep_minutes", "rem_sleep", 0)).toBe(true);
    expect(isMechanicalRelation("sleep_minutes", "sleep_fragmentation", 0)).toBe(true);
    expect(isMechanicalRelation("sleep_minutes", "deep_sleep", 1)).toBe(false);
    expect(isMechanicalRelation("sleep_minutes", "hrv", 1)).toBe(false);
    expect(isMechanicalRelation("sleep_minutes", "recovery", 1)).toBe(true);
  });
});

describe("Personal Lab run-day coverage", () => {
  it("only treats activity-covered days as evidence for no run", () => {
    expect(hasReliableActivityCoverage({ data_quality: { presentTypes: ["sleep"] } })).toBe(false);
    expect(hasReliableActivityCoverage({ data_quality: { presentTypes: ["steps"] } })).toBe(false);
    expect(hasReliableActivityCoverage({ data_quality: { presentTypes: ["exercise"] } })).toBe(true);
    expect(hasReliableActivityCoverage({ data_quality: undefined })).toBe(false);
  });

  it("builds yes/no run observations without turning uncovered days into no", () => {
    const result = runningDaySeries([
      { metric_date: "2026-08-01", running_distance_km: 5, running_duration_minutes: 30, running_pace_seconds_per_km: 360, running_average_heart_rate: 150, data_quality: { presentTypes: ["exercise"] } },
      { metric_date: "2026-08-02", running_distance_km: null, running_duration_minutes: null, running_pace_seconds_per_km: null, running_average_heart_rate: null, data_quality: { presentTypes: ["exercise"] } },
      { metric_date: "2026-08-03", running_distance_km: null, running_duration_minutes: null, running_pace_seconds_per_km: null, running_average_heart_rate: null, data_quality: { presentTypes: ["sleep"] } },
    ]);
    expect(result.kind).toBe("binary");
    expect(result.points).toEqual([
      { date: "2026-08-01", value: 1, segment: undefined },
      { date: "2026-08-02", value: 0, segment: undefined },
    ]);
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

describe("Personal Lab progressive stream", () => {
  it("exposes overview and journal independently from the complete analysis", async () => {
    vi.stubEnv("SOMA_LOCAL_PREVIEW", "true");
    try {
      const stream = createPersonalLabStream({ id: "preview-user", email: null, displayName: "Jeremy" }, { periods: [30] });
      const [overview, journal] = await Promise.all([stream.overview, stream.journal]);

      expect(overview.today).toHaveProperty("sleepMinutes");
      expect(journal.journal.variables.length).toBeGreaterThan(0);
      expect(journal.todayDate).toBe(overview.todayDate);

      const analysis = await stream.analysis;
      expect(analysis.today).toEqual(overview.today);
      expect(analysis.journal).toEqual(journal.journal);
      expect(analysis.matrix.periods).toContain(30);
      expect(analysis.matrix.outcomes.some((outcome) => outcome.id === "sleep_awakenings")).toBe(false);
      expect(analysis.matrix.rows.flatMap((row) => row.relations).some((relation) => relation.outcomeId === "sleep_awakenings" || relation.predictorId === "sleep_awakenings")).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
