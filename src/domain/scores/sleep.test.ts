import { describe, expect, it } from "vitest";

import { calculateSleepScore } from "./sleep";

describe("calculateSleepScore", () => {
  it("returns a transparent weighted score", () => {
    const result = calculateSleepScore({
      actualSleepMinutes: 432,
      estimatedNeedMinutes: 480,
      efficiencyPercent: 90,
      regularityPercent: 80,
    });

    expect(result.score).toBe(88);
    expect(result.algorithmVersion).toBe("sleep-v0.2");
  });

  it("caps each component at one", () => {
    const result = calculateSleepScore({
      actualSleepMinutes: 600,
      estimatedNeedMinutes: 480,
      efficiencyPercent: 120,
      regularityPercent: 120,
    });

    expect(result.score).toBe(100);
  });

  it("rejects an invalid sleep need", () => {
    expect(() =>
      calculateSleepScore({
        actualSleepMinutes: 420,
        estimatedNeedMinutes: 0,
        efficiencyPercent: 90,
        regularityPercent: 80,
      }),
    ).toThrow("Estimated sleep need must be greater than zero.");
  });
});
