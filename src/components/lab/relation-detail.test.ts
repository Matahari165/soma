import { describe, expect, it } from "vitest";

import { effectText, percentText } from "./relation-detail";

describe("relation detail formatting", () => {
  it("uses percentage points for an outcome already expressed as a percentage", () => {
    expect(effectText({ effect: 1.3, outcomeUnit: "%" })).toBe("+1.3 pp");
  });

  it("does not invent a relative percentage when none was calculated", () => {
    expect(percentText({ percentEffect: null })).toBeNull();
  });
});
