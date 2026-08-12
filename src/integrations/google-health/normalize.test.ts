import { describe, expect, it } from "vitest";

import { normalizeGoogleHealthDailyRollup, normalizeGoogleHealthPoint } from "./normalize";

describe("Google Health normalization contract", () => {
  it("preserves the provider payload and extracts a civil daily date", () => {
    const point = { name: "users/me/dataTypes/daily-heart-rate-variability/dataPoints/abc", dataSource: { recordingMethod: "RECORDING_METHOD_AUTOMATICALLY_RECORDED", device: { displayName: "Fitbit" } }, dailyHeartRateVariability: { date: { year: 2026, month: 8, day: 7 }, averageHeartRateVariabilityMilliseconds: 52 } };
    const result = normalizeGoogleHealthPoint("user-1", "daily-heart-rate-variability", point);
    expect(result.civil_date).toBe("2026-08-07");
    expect(result.source_device).toBe("Fitbit");
    expect(result.payload).toEqual(point);
  });

  it("keeps one stable daily rollup record when Google revises the value", () => {
    const interval = { civilStartTime: { date: { year: 2026, month: 8, day: 7 } }, civilEndTime: { date: { year: 2026, month: 8, day: 8 } } };
    const first = normalizeGoogleHealthDailyRollup("user-1", "total-calories", { ...interval, kcal: 2_100 });
    const revised = normalizeGoogleHealthDailyRollup("user-1", "total-calories", { ...interval, kcal: 2_240 });

    expect(revised.source_record_id).toBe(first.source_record_id);
    expect(revised.civil_date).toBe("2026-08-07");
  });

  it("falls back to the physical end date for sleep without a civil date", () => {
    const result = normalizeGoogleHealthPoint("user-1", "sleep", {
      name: "users/me/dataTypes/sleep/dataPoints/night-1",
      sleep: { interval: { startTime: "2026-08-11T22:15:00Z", endTime: "2026-08-12T06:45:00Z" } },
    });

    expect(result.civil_date).toBe("2026-08-12");
    expect(result.start_time).toBe("2026-08-11T22:15:00Z");
    expect(result.end_time).toBe("2026-08-12T06:45:00Z");
  });
});
