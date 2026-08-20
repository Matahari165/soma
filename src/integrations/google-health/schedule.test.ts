import { describe, expect, it } from "vitest";

import {
  automaticGoogleHealthRange,
  isAutomaticGoogleHealthSyncDue,
  zonedClock,
} from "./schedule";

describe("Google Health daily schedule", () => {
  it("runs once at 11:00 in the profile timezone", () => {
    const now = new Date("2026-08-20T09:05:00.000Z");
    expect(isAutomaticGoogleHealthSyncDue({ now, timezone: "Europe/Paris", lastSyncedAt: null })).toEqual({ due: true, civilDate: "2026-08-20" });
    expect(isAutomaticGoogleHealthSyncDue({ now, timezone: "Europe/Paris", lastSyncedAt: "2026-08-20T07:30:00.000Z" }).due).toBe(false);
    expect(isAutomaticGoogleHealthSyncDue({ now: new Date("2026-08-20T08:59:00.000Z"), timezone: "Europe/Paris", lastSyncedAt: null }).due).toBe(false);
  });

  it("keeps 11:00 local through daylight-saving changes", () => {
    expect(zonedClock(new Date("2026-01-20T10:00:00.000Z"), "Europe/Paris").hour).toBe(11);
    expect(zonedClock(new Date("2026-08-20T09:00:00.000Z"), "Europe/Paris").hour).toBe(11);
  });

  it("refreshes only the recent seven-day reconciliation window", () => {
    const range = automaticGoogleHealthRange(new Date("2026-08-20T09:00:00.000Z"));
    expect(range).toEqual({ start: "2026-08-13T09:00:00.000Z", end: "2026-08-20T09:00:00.000Z" });
  });
});
