import { describe, expect, it } from "vitest";

import { effortContextForDate } from "./personal-lab-today";

describe("activity goals and nutrition load", () => {
  it("shows goal completion on Home while keeping nutrition on the original load scale", () => {
    const scores = [{ score_date: "2026-01-02", kind: "effort" as const, score: 100, drivers: { coverage: 1, activityLoadScore: 50, strainVersion: "effort-v5" } }];
    expect(effortContextForDate(scores, "2026-01-02")).toMatchObject({ effortScore: 100, averageEffortScore: 100 });
    expect(effortContextForDate(scores, "2026-01-02", "load")).toMatchObject({ effortScore: 50, averageEffortScore: 50 });
  });
});
