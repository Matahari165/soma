import { describe, expect, it } from "vitest";

import { averageLast30Measured, averageLast30MeasuredWithCount, formatDurationMinutes, healthSourceLabel, latestSourceMeasuredAt, measuredCoverage, metricTone } from "./health-metric-utils";

describe("health metric comparisons", () => {
  it("averages measured values across the inclusive 30-day window", () => {
    const days = [
      { metric_date: "2026-07-28", value: 100 },
      { metric_date: "2026-07-29", value: null },
      { metric_date: "2026-07-30", value: 200 },
      { metric_date: "2026-08-27", value: 300 },
    ];

    expect(averageLast30Measured(days, "value", "2026-08-27")).toBe(250);
    expect(averageLast30MeasuredWithCount(days, "value", "2026-08-27")).toEqual({ value: 250, measuredDays: 2 });
  });

  it("uses the favorable direction to assign a comparison tone", () => {
    expect(metricTone(480, 450, "higher_is_better")).toBe("positive");
    expect(metricTone(60, 55, "lower_is_better")).toBe("negative");
    expect(metricTone(55, 55, "higher_is_better")).toBe("positive");
    expect(metricTone(55, 55, "lower_is_better")).toBe("positive");
  });

  it("rounds duration averages without producing 60 minutes", () => {
    expect(formatDurationMinutes(480.6)).toBe("8 h 1 min");
  });

  it("counts an explicit zero as measured while preserving null as absent", () => {
    expect(measuredCoverage([null, 0, 42])).toBeCloseTo(2 / 3);
    expect(measuredCoverage([null, null])).toBe(0);
  });

  it("uses the freshest source timestamp across every recovery signal", () => {
    expect(latestSourceMeasuredAt({
      metric_date: "2026-09-10",
      source_freshness: {
        latestMeasuredAt: "2026-09-10T06:00:00.000Z",
        byType: {
          sleep: "2026-09-10T07:00:00.000Z",
          "daily-heart-rate-variability": "2026-09-10T05:00:00.000Z",
        },
      },
    })).toBe("2026-09-10T07:00:00.000Z");
  });

  it("labels the recorded source and keeps missing provenance generic", () => {
    expect(healthSourceLabel({ data_quality: { source: "apple_health", primaryWearable: "Apple Watch" } })).toBe("Apple Health");
    expect(healthSourceLabel({ data_quality: { providers: ["google_health"] } })).toBe("Google Health");
    expect(healthSourceLabel({ data_quality: {} })).toBe("Health source");
  });
});
