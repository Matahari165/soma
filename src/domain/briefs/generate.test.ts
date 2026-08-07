import { describe, expect, it } from "vitest";

import { generateEveningBrief, generateMorningBrief, generateWeeklyBrief } from "./generate";

describe("deterministic briefs", () => {
  it("summarizes morning signals without making a diagnosis", () => {
    expect(generateMorningBrief({ sleepScore: 82, recoveryScore: 74, effortScore: 20, effortTarget: [55, 70], bedtime: "22:45", insightTitles: [] }))
      .toContain("support the planned session");
  });

  it("compares evening effort with its target", () => {
    expect(generateEveningBrief({ sleepScore: 82, recoveryScore: 74, effortScore: 61, effortTarget: [55, 70], bedtime: "22:45", insightTitles: [] }))
      .toContain("within the target zone");
  });

  it("wraps daily scores in a weekly effort target", () => {
    expect(generateWeeklyBrief({ averageSleepScore: 79, averageRecoveryScore: 71, weeklyEffort: 405, weeklyEffortTarget: [390, 450], insightTitles: ["Bedtime became more regular"] }))
      .toContain("within the 390–450 target");
  });
});
