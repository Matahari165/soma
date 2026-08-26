import { afterEach, describe, expect, it, vi } from "vitest";

import { groupOutcomeThemes, influenceExplanation, matrixScrollBehavior, matrixTimingLabel, periodLabel } from "./correlation-matrix";

describe("relationship matrix motion helpers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("formats the four analysis period labels", () => {
    expect(periodLabel(15)).toBe("15d");
    expect(periodLabel(30)).toBe("30d");
    expect(periodLabel(90)).toBe("90d");
    expect(periodLabel("all")).toBe("All");
  });

  it("groups consecutive outcomes into readable themes", () => {
    expect(groupOutcomeThemes([
      { id: "sleep_minutes", label: "Sleep duration", unit: "min", direction: "target" },
      { id: "sleep_efficiency", label: "Sleep efficiency", unit: "%", direction: "higher" },
      { id: "hrv", label: "HRV", unit: "ms", direction: "higher" },
      { id: "rhr", label: "Resting heart rate", unit: "bpm", direction: "lower" },
      { id: "respiratory", label: "Respiratory rate", unit: "/min", direction: "target" },
    ])).toEqual([
      { label: "Sleep", count: 2 },
      { label: "Cardio & recovery", count: 2 },
      { label: "Breathing & oxygen", count: 1 },
    ]);
  });

  it("uses an instant scroll when reduced motion is enabled", () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
    });

    expect(matrixScrollBehavior()).toBe("auto");
  });

  it("keeps smooth scrolling available when motion is allowed", () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    });

    expect(matrixScrollBehavior()).toBe("smooth");
  });

  it("only labels delayed matrix relationships", () => {
    expect(matrixTimingLabel(0)).toBeNull();
    expect(matrixTimingLabel(1)).toBe("J+1");
    expect(matrixTimingLabel(2)).toBe("J+2");
  });

  it("explains the indicator definition and provenance", () => {
    expect(influenceExplanation("exercise_minutes", "Exercise time")).toMatchObject({
      source: "Google Health",
      calculation: expect.stringContaining("daily exercise-minute"),
    });
    expect(influenceExplanation("sleep_regularity", "Sleep regularity")).toMatchObject({
      source: "Soma",
      sourceDetail: expect.stringContaining("Google Health"),
    });
    expect(influenceExplanation("journal:custom", "Evening reading")).toMatchObject({
      source: "Journal",
      sourceDetail: expect.stringContaining("Journal"),
    });
  });
});
