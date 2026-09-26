import { describe, expect, it } from "vitest";

import { generateEveningBrief, generateMorningBrief } from "./generate";

describe("deterministic briefs", () => {
  it("summarizes morning signals without making a diagnosis", () => {
    expect(generateMorningBrief({ sleepScore: 82, recoveryScore: 74, effortScore: 20, bedtime: "22:45", insightTitles: [] }))
      .toContain("support the planned session");
  });

  it("compares evening effort with its target", () => {
    expect(generateEveningBrief({ sleepScore: 82, recoveryScore: 74, effortScore: 61, bedtime: "22:45", insightTitles: [] }))
      .toContain("activity goal score is 61/100");
  });
});
