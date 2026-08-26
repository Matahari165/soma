import { describe, expect, it } from "vitest";

import { evidenceCandidatesForNarrative, shouldGenerateDailyNarrative } from "./lab-narrative-policy";

describe("daily narrative policy", () => {
  it("never starts a second generation for a current daily analysis", () => {
    expect(shouldGenerateDailyNarrative({ isCurrent: true, needsRefresh: true, candidateCount: 12 })).toBe(false);
    expect(shouldGenerateDailyNarrative({ isCurrent: false, needsRefresh: true, candidateCount: 12 })).toBe(true);
  });

  it("supports old narratives that only contain source_facts", () => {
    const legacyFacts = [{ predictor: "Steps", outcome: "HRV" }];
    expect(evidenceCandidatesForNarrative({ source_facts: legacyFacts })).toEqual(legacyFacts);
    expect(evidenceCandidatesForNarrative({ evidence_candidates: [{ predictor: "Sleep", outcome: "Recovery" }], source_facts: legacyFacts })).toEqual([{ predictor: "Sleep", outcome: "Recovery" }]);
  });

  it("keeps at most twelve candidates", () => {
    expect(evidenceCandidatesForNarrative({ evidence_candidates: Array.from({ length: 20 }, (_, index) => index) })).toHaveLength(12);
  });
});
