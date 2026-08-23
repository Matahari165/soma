import { describe, expect, it } from "vitest";

import { aggregatePairedWeekly, aggregateWeekly } from "./weekly";

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

  it("builds both weekly means from the exact same paired dates", () => {
    const predictor = [
      { date: "2026-08-03", value: 1, segment: "Fitbit" },
      { date: "2026-08-04", value: 2, segment: "Fitbit" },
      { date: "2026-08-05", value: 100, segment: "Fitbit" },
      { date: "2026-08-06", value: 4, segment: "Fitbit" },
      { date: "2026-08-07", value: 5, segment: "Fitbit" },
    ];
    const outcome = [
      { date: "2026-08-03", value: 10, segment: "Fitbit" },
      { date: "2026-08-04", value: 20, segment: "Fitbit" },
      { date: "2026-08-06", value: 40, segment: "Fitbit" },
      { date: "2026-08-07", value: 50, segment: "Fitbit" },
      { date: "2026-08-08", value: 900, segment: "Fitbit" },
    ];
    const result = aggregatePairedWeekly(predictor, outcome, 0, 4);
    expect(result.predictor).toEqual([{ date: "2026-08-03", value: 3, segment: "Fitbit" }]);
    expect(result.outcome).toEqual([{ date: "2026-08-03", value: 30, segment: "Fitbit" }]);
    expect(result.pairedDaysByWeek).toEqual([{ date: "2026-08-03", pairedDays: 4 }]);
  });

  it("rejects a week with fewer than four shared days", () => {
    const predictor = [1, 2, 3, 4].map((value, index) => ({ date: `2026-08-0${index + 3}`, value, segment: "WHOOP" }));
    const outcome = [1, 2, 3].map((value, index) => ({ date: `2026-08-0${index + 3}`, value, segment: "WHOOP" }));
    expect(aggregatePairedWeekly(predictor, outcome).predictor).toEqual([]);
  });
});
