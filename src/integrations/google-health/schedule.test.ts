import { describe, expect, it } from "vitest";

import {
  automaticGoogleHealthRange,
  isAutomaticGoogleHealthSyncDue,
  zonedClock,
} from "./schedule";

describe("Google Health hourly schedule", () => {
  it("runs once per completed UTC hour", () => {
    const now = new Date("2026-08-20T09:05:00.000Z");
    expect(isAutomaticGoogleHealthSyncDue({ now, timezone: "Europe/Paris", lastSyncedAt: null })).toEqual({ due: true, civilDate: "2026-08-20", slot: "2026-08-20T09:00:00.000Z" });
    expect(isAutomaticGoogleHealthSyncDue({ now, timezone: "Europe/Paris", lastSyncedAt: "2026-08-20T09:01:00.000Z" }).due).toBe(false);
    expect(isAutomaticGoogleHealthSyncDue({ now, timezone: "Europe/Paris", lastSyncedAt: "2026-08-20T08:59:00.000Z" }).due).toBe(true);
  });

  it("keeps local-hour labels correct through daylight-saving changes", () => {
    expect(zonedClock(new Date("2026-01-20T10:00:00.000Z"), "Europe/Paris").hour).toBe(11);
    expect(zonedClock(new Date("2026-08-20T09:00:00.000Z"), "Europe/Paris").hour).toBe(11);
  });

  it("refreshes a three-day reconciliation window", () => {
    const range = automaticGoogleHealthRange(new Date("2026-08-20T09:00:00.000Z"));
    expect(range).toEqual({ start: "2026-08-17T09:00:00.000Z", end: "2026-08-20T09:00:00.000Z" });
  });
});
