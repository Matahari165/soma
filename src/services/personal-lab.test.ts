import { describe, expect, it } from "vitest";

import { hasReliableOvernightData, overnightFingerprint } from "./personal-lab";

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
