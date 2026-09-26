import { describe, expect, it } from "vitest";

import { classifyPercentMaxHeartRate, resolveMaximumHeartRate } from "./heart-rate-zones";

describe("resolveMaximumHeartRate", () => {
  it("prefers an integer personal maximum in the accepted range", () => {
    expect(resolveMaximumHeartRate({ personalBpm: 190, dateOfBirth: "2000-01-01", date: "2026-09-24" }))
      .toEqual({ bpm: 190, source: "personal" });
    expect(resolveMaximumHeartRate({ personalBpm: 80, dateOfBirth: null, date: "invalid" }))
      .toEqual({ bpm: 80, source: "personal" });
    expect(resolveMaximumHeartRate({ personalBpm: 250, dateOfBirth: null, date: "invalid" }))
      .toEqual({ bpm: 250, source: "personal" });
  });

  it("falls back to the Tanaka estimate at the session age, including the birthday boundary", () => {
    expect(resolveMaximumHeartRate({ dateOfBirth: "1986-09-24", date: "2026-09-23" }))
      .toEqual({ bpm: 181, source: "age_estimate" });
    expect(resolveMaximumHeartRate({ dateOfBirth: "1986-09-24", date: "2026-09-24" }))
      .toEqual({ bpm: 180, source: "age_estimate" });
    expect(resolveMaximumHeartRate({ dateOfBirth: "2000-02-29", date: "2024-02-28" }))
      .toEqual({ bpm: 192, source: "age_estimate" });
    expect(resolveMaximumHeartRate({ dateOfBirth: "2000-02-29", date: "2024-02-29" }))
      .toEqual({ bpm: 191, source: "age_estimate" });
  });

  it("ignores invalid personal values and declines invalid dates or ages outside 18–100", () => {
    expect(resolveMaximumHeartRate({ personalBpm: 79, dateOfBirth: "2000-01-01", date: "2026-09-24" }))
      .toEqual({ bpm: 190, source: "age_estimate" });
    expect(resolveMaximumHeartRate({ personalBpm: "190", dateOfBirth: "2000-01-01", date: "2026-09-24" }))
      .toEqual({ bpm: 190, source: "age_estimate" });
    expect(resolveMaximumHeartRate({ personalBpm: Number.NaN, dateOfBirth: "2000-01-01", date: "2026-09-24" }))
      .toEqual({ bpm: 190, source: "age_estimate" });
    expect(resolveMaximumHeartRate({ dateOfBirth: "2020-01-01", date: "2037-01-01" })).toBeNull();
    expect(resolveMaximumHeartRate({ dateOfBirth: "1925-01-01", date: "2026-01-01" })).toBeNull();
    expect(resolveMaximumHeartRate({ dateOfBirth: "2001-02-29", date: "2026-09-24" })).toBeNull();
    expect(resolveMaximumHeartRate({ dateOfBirth: "1986-09-24", date: "2026-02-30" })).toBeNull();
  });
});

describe("classifyPercentMaxHeartRate", () => {
  it("uses inclusive lower bounds, exclusive upper bounds, and includes exactly 100% in zone five", () => {
    expect(classifyPercentMaxHeartRate(99, 200)).toEqual({ zone: null, belowZone: true, aboveMaximum: false });
    expect(classifyPercentMaxHeartRate(100, 200)).toEqual({ zone: "z1", belowZone: false, aboveMaximum: false });
    expect(classifyPercentMaxHeartRate(119, 200)).toEqual({ zone: "z1", belowZone: false, aboveMaximum: false });
    expect(classifyPercentMaxHeartRate(120, 200)).toEqual({ zone: "z2", belowZone: false, aboveMaximum: false });
    expect(classifyPercentMaxHeartRate(140, 200)).toEqual({ zone: "z3", belowZone: false, aboveMaximum: false });
    expect(classifyPercentMaxHeartRate(160, 200)).toEqual({ zone: "z4", belowZone: false, aboveMaximum: false });
    expect(classifyPercentMaxHeartRate(180, 200)).toEqual({ zone: "z5", belowZone: false, aboveMaximum: false });
    expect(classifyPercentMaxHeartRate(200, 200)).toEqual({ zone: "z5", belowZone: false, aboveMaximum: false });
    expect(classifyPercentMaxHeartRate(201, 200)).toEqual({ zone: null, belowZone: false, aboveMaximum: true });
  });

  it("returns no classification for invalid readings or maxima", () => {
    expect(classifyPercentMaxHeartRate(Number.NaN, 200)).toBeNull();
    expect(classifyPercentMaxHeartRate(120, Number.NaN)).toBeNull();
    expect(classifyPercentMaxHeartRate(120, 79)).toBeNull();
  });
});
