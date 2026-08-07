import { describe, expect, it } from "vitest";

import { normalizeGoogleHealthPoint } from "./normalize";

describe("Google Health normalization contract", () => {
  it("preserves the provider payload and extracts a civil daily date", () => {
    const point = { name: "users/me/dataTypes/daily-heart-rate-variability/dataPoints/abc", dataSource: { recordingMethod: "RECORDING_METHOD_AUTOMATICALLY_RECORDED", device: { displayName: "Fitbit" } }, dailyHeartRateVariability: { date: { year: 2026, month: 8, day: 7 }, averageHeartRateVariabilityMilliseconds: 52 } };
    const result = normalizeGoogleHealthPoint("user-1", "daily-heart-rate-variability", point);
    expect(result.civil_date).toBe("2026-08-07");
    expect(result.source_device).toBe("Fitbit");
    expect(result.payload).toEqual(point);
  });
});
