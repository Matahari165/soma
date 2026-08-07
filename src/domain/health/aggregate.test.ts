import { describe, expect, it } from "vitest";

import { aggregateHealthRecords, type NormalizedHealthRecord } from "./aggregate";

const record = (overrides: Partial<NormalizedHealthRecord>): NormalizedHealthRecord => ({
  data_type: "steps",
  civil_date: "2026-08-07",
  start_time: null,
  end_time: null,
  measured_at: "2026-08-07T12:00:00Z",
  payload: {},
  ...overrides,
});

describe("aggregateHealthRecords", () => {
  it("aggregates a day without guessing missing metrics", () => {
    const [day] = aggregateHealthRecords([
      record({ payload: { steps: { count: "4200" } } }),
      record({ data_type: "steps", payload: { steps: { count: 800 } } }),
      record({ data_type: "daily-heart-rate-variability", payload: { dailyHeartRateVariability: { averageHeartRateVariabilityMilliseconds: 52 } } }),
      record({ data_type: "sleep", start_time: "2026-08-06T22:30:00Z", end_time: "2026-08-07T06:30:00Z", payload: { sleep: { summary: { minutesAsleep: 440, minutesInSleepPeriod: 480 } } } }),
    ]);
    expect(day.steps).toBe(5000);
    expect(day.hrv_ms).toBe(52);
    expect(day.sleep_minutes).toBe(440);
    expect(day.sleep_efficiency).toBe(91.7);
    expect(day.resting_heart_rate).toBeNull();
  });
});
