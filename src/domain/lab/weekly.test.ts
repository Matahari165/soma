import { describe, expect, it } from "vitest";

import { aggregateWeekly } from "./weekly";

describe("Personal Lab weekly aggregation", () => {
  it("averages raw daily values before the weekly analysis", () => {
    const points = [1, 2, 3, 4, 5, 6, 7].map((value, index) => ({
      date: `2026-08-${String(index + 3).padStart(2, "0")}`,
      value,
      segment: "WHOOP",
    }));

    expect(aggregateWeekly(points, "mean", new Set(["2026-08-03"]), 4)).toEqual([
      { date: "2026-08-03", value: 4, segment: "WHOOP" },
    ]);
  });

  it("excludes weeks with too few values or mixed wearable sources", () => {
    const points = [
      { date: "2026-08-03", value: 1, segment: "WHOOP" },
      { date: "2026-08-04", value: 2, segment: "WHOOP" },
      { date: "2026-08-05", value: 3, segment: "Fitbit" },
      { date: "2026-08-10", value: 4, segment: "Fitbit" },
      { date: "2026-08-11", value: 5, segment: "Fitbit" },
    ];

    expect(aggregateWeekly(points, "mean", new Set(["2026-08-03", "2026-08-10"]), 3)).toEqual([]);
  });
});
