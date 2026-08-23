import { describe, expect, it } from "vitest";

import { ANALYSIS_DATA_TYPES, minutesSinceMidnightIn } from "./analysis";

describe("civil-time health analysis", () => {
  it("uses the profile timezone instead of the server timezone", () => {
    expect(minutesSinceMidnightIn("2026-08-20T21:30:00.000Z", "Europe/Paris")).toBe(23 * 60 + 30);
    expect(minutesSinceMidnightIn("2026-08-20T21:30:00.000Z", "America/New_York")).toBe(17 * 60 + 30);
  });

  it("follows daylight-saving transitions", () => {
    expect(minutesSinceMidnightIn("2026-03-29T00:30:00.000Z", "Europe/Paris")).toBe(90);
    expect(minutesSinceMidnightIn("2026-03-29T01:30:00.000Z", "Europe/Paris")).toBe(210);
  });

  it("does not reload unused high-frequency series for daily materialization", () => {
    expect(ANALYSIS_DATA_TYPES).not.toContain("heart-rate");
    expect(ANALYSIS_DATA_TYPES).not.toContain("heart-rate-variability");
    expect(ANALYSIS_DATA_TYPES).toContain("daily-heart-rate-variability");
    expect(ANALYSIS_DATA_TYPES).toContain("daily-resting-heart-rate");
  });
});
