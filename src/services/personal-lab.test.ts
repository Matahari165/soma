import { describe, expect, it } from "vitest";

import { analysisWindowForPeriods, hasReliableOvernightData, labMatrixCacheKey, overnightFingerprint } from "./personal-lab";

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
