import { describe, expect, it } from "vitest";

import { calculateSignalFreshness } from "./freshness";

describe("signal freshness", () => {
  const now = new Date("2026-08-20T12:00:00.000Z");

  it("keeps missing measurements distinct from stale measurements", () => {
    expect(calculateSignalFreshness({ measuredAt: null, importedAt: now.toISOString(), coverage: 0, now }).state).toBe("missing");
    expect(calculateSignalFreshness({ measuredAt: "2026-08-15T08:00:00.000Z", importedAt: now.toISOString(), coverage: 1, now }).state).toBe("stale");
  });

  it("marks recent but incomplete signals as partial", () => {
    expect(calculateSignalFreshness({ measuredAt: "2026-08-20T08:00:00.000Z", importedAt: now.toISOString(), coverage: 0.5, now })).toMatchObject({ state: "partial", coverage: 0.5 });
  });

  it("only marks a recent, imported, complete signal as current", () => {
    expect(calculateSignalFreshness({ measuredAt: "2026-08-20T08:00:00.000Z", importedAt: "2026-08-20T08:05:00.000Z", coverage: 1, now }).state).toBe("current");
  });

  it("does not call data current after imports stop", () => {
    expect(calculateSignalFreshness({ measuredAt: "2026-08-20T08:00:00.000Z", importedAt: "2026-08-15T08:00:00.000Z", coverage: 1, now }).state).toBe("stale");
  });
});
