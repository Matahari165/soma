import { describe, expect, it } from "vitest";

import { evidenceCandidatesForNarrative, isWeeklyNarrativeCurrent, shouldGenerateWeeklyNarrative } from "./lab-narrative-policy";

describe("weekly narrative policy", () => {
  it("keeps one synthesis current for seven full days", () => {
    const generatedAt = "2026-08-24T12:00:00.000Z";
    expect(isWeeklyNarrativeCurrent(generatedAt, new Date("2026-08-31T11:59:59.999Z"))).toBe(true);
    expect(isWeeklyNarrativeCurrent(generatedAt, new Date("2026-08-31T12:00:00.000Z"))).toBe(false);
    expect(isWeeklyNarrativeCurrent("invalid", new Date("2026-08-31T12:00:00.000Z"))).toBe(false);
  });

  it("requires ten reliable candidates before starting a weekly generation", () => {
    expect(shouldGenerateWeeklyNarrative({ isCurrent: true, needsRefresh: true, candidateCount: 12 })).toBe(false);
    expect(shouldGenerateWeeklyNarrative({ isCurrent: false, needsRefresh: true, candidateCount: 9 })).toBe(false);
    expect(shouldGenerateWeeklyNarrative({ isCurrent: false, needsRefresh: true, candidateCount: 10 })).toBe(true);
  });

  it("supports old narratives that only contain source_facts", () => {
    const legacyFacts = [{ predictor: "Steps", outcome: "HRV" }];
    expect(evidenceCandidatesForNarrative({ source_facts: legacyFacts })).toEqual(legacyFacts);
    expect(evidenceCandidatesForNarrative({ evidence_candidates: [{ predictor: "Sleep", outcome: "Recovery" }], source_facts: legacyFacts })).toEqual([{ predictor: "Sleep", outcome: "Recovery" }]);
  });

  it("keeps at most twenty candidates for the two eligible periods", () => {
    expect(evidenceCandidatesForNarrative({ evidence_candidates: Array.from({ length: 30 }, (_, index) => index) })).toHaveLength(20);
  });
});
