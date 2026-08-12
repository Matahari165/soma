import { describe, expect, it } from "vitest";

import { shouldRefreshAnalytics } from "./sync";

describe("Google Health incremental analytics refresh", () => {
  const now = new Date("2026-08-12T12:00:00.000Z");

  it("refreshes the dashboard after a recent non-empty import batch", () => {
    expect(shouldRefreshAnalytics(25, new Date("2026-08-12T00:00:00.000Z"), now)).toBe(true);
  });

  it("does not recompute for an empty batch", () => {
    expect(shouldRefreshAnalytics(0, new Date("2026-08-12T00:00:00.000Z"), now)).toBe(false);
  });

  it("does not recompute repeatedly while importing old history", () => {
    expect(shouldRefreshAnalytics(100, new Date("2025-08-12T00:00:00.000Z"), now)).toBe(false);
  });
});
