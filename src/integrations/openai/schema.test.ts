import { describe, expect, it } from "vitest";

import { coachResponseSchema } from "./schema";

describe("Soma Coach output contract", () => {
  it("accepts a grounded read response", () => {
    expect(coachResponseSchema.parse({ answer: "Recovery is within your range.", evidence: ["Recovery 72/100 · August 7"], proposedAction: null }).answer).toContain("Recovery");
  });

  it("rejects an unbounded write action", () => {
    expect(() => coachResponseSchema.parse({ answer: "Done.", evidence: [], proposedAction: { type: "delete_account", title: "Delete", description: "Delete everything", payload: {} } })).toThrow();
  });
});
