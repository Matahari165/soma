import { describe, expect, it } from "vitest";

import { generateEveningBrief, generateMorningBrief, generateWeeklyBrief } from "./generate";

describe("deterministic briefs", () => {
  it("summarizes morning signals without making a diagnosis", () => {
    expect(generateMorningBrief({ sleepScore: 82, recoveryScore: 74, effortScore: 20, bedtime: "22:45", insightTitles: [] }))
      .toContain("support the planned session");
  });

  it("compares evening effort with its target", () => {
    expect(generateEveningBrief({ sleepScore: 82, recoveryScore: 74, effortScore: 61, bedtime: "22:45", insightTitles: [] }))
      .toContain("accomplished load is 61/100");
  });

  it("reports accumulated weekly load without prescribing a target", () => {
    expect(generateWeeklyBrief({ averageSleepScore: 79, averageRecoveryScore: 71, weeklyEffort: 405, insightTitles: ["Bedtime became more regular"] }))
      .toContain("Weekly accumulated load is 405");
  });
});
