import { describe, expect, it } from "vitest";

import { averageLast30Measured, formatDurationMinutes, metricTone } from "./health-metric-utils";

describe("health metric comparisons", () => {
  it("averages measured values across the inclusive 30-day window", () => {
    const days = [
      { metric_date: "2026-07-28", value: 100 },
      { metric_date: "2026-07-29", value: null },
      { metric_date: "2026-07-30", value: 200 },
      { metric_date: "2026-08-27", value: 300 },
    ];

    expect(averageLast30Measured(days, "value", "2026-08-27")).toBe(250);
  });

  it("uses the favorable direction to assign a comparison tone", () => {
    expect(metricTone(480, 450, "higher_is_better")).toBe("positive");
    expect(metricTone(60, 55, "lower_is_better")).toBe("negative");
    expect(metricTone(55, 55, "higher_is_better")).toBe("positive");
    expect(metricTone(55, 55, "lower_is_better")).toBe("positive");
  });

  it("rounds duration averages without producing 60 minutes", () => {
    expect(formatDurationMinutes(480.6)).toBe("8h 1m");
  });
});
