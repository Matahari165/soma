import { describe, expect, it } from "vitest";

import {
  automaticGoogleHealthDataTypes,
  automaticGoogleHealthRange,
  clampGoogleHealthRangeToConnection,
  googleHealthHistorySeededFromTakeout,
  isAutomaticGoogleHealthSyncDue,
  zonedClock,
} from "./schedule";
import { GOOGLE_HEALTH_SCOPES } from "./client";

describe("Google Health hourly schedule", () => {
  it("uses a verified Takeout boundary for subsequent API updates", () => {
    const metadata = { takeout_imported_through: "2026-08-22", api_sync_start: "2026-08-23" };
    expect(googleHealthHistorySeededFromTakeout(metadata)).toBe(true);
    expect(clampGoogleHealthRangeToConnection({
      start: "2026-08-20T12:00:00.000Z",
      end: "2026-08-25T12:00:00.000Z",
    }, metadata)).toEqual({
      start: "2026-08-23T00:00:00.000Z",
      end: "2026-08-25T12:00:00.000Z",
    });
  });

  it("ignores malformed Takeout boundaries", () => {
    expect(googleHealthHistorySeededFromTakeout({ takeout_imported_through: "2009" })).toBe(false);
    expect(clampGoogleHealthRangeToConnection({ start: "2026-08-20T00:00:00.000Z", end: "2026-08-25T00:00:00.000Z" }, { api_sync_start: "invalid" }).start).toBe("2026-08-20T00:00:00.000Z");
  });

  it("runs once per completed UTC hour", () => {
    const now = new Date("2026-08-20T09:05:00.000Z");
    expect(isAutomaticGoogleHealthSyncDue({ now, timezone: "Europe/Paris", lastLabSyncedAt: null })).toEqual({ due: true, civilDate: "2026-08-20", slot: "2026-08-20T09:00:00.000Z" });
    expect(isAutomaticGoogleHealthSyncDue({ now, timezone: "Europe/Paris", lastLabSyncedAt: "2026-08-20T09:01:00.000Z" }).due).toBe(false);
    expect(isAutomaticGoogleHealthSyncDue({ now, timezone: "Europe/Paris", lastLabSyncedAt: "2026-08-20T08:59:00.000Z" }).due).toBe(true);
  });

  it("keeps local-hour labels correct through daylight-saving changes", () => {
    expect(zonedClock(new Date("2026-01-20T10:00:00.000Z"), "Europe/Paris").hour).toBe(11);
    expect(zonedClock(new Date("2026-08-20T09:00:00.000Z"), "Europe/Paris").hour).toBe(11);
  });

  it("refreshes a three-day reconciliation window", () => {
    const range = automaticGoogleHealthRange(new Date("2026-08-20T09:00:00.000Z"));
    expect(range).toEqual({ start: "2026-08-17T09:00:00.000Z", end: "2026-08-20T09:00:00.000Z" });
  });

  it("prioritizes all hourly health metrics without blocking on raw streams", () => {
    const dataTypes = automaticGoogleHealthDataTypes(GOOGLE_HEALTH_SCOPES);

    expect(dataTypes).toEqual(expect.arrayContaining([
      "sleep",
      "daily-heart-rate-variability",
      "daily-resting-heart-rate",
      "daily-heart-rate-zones",
      "steps",
      "active-zone-minutes",
      "time-in-heart-rate-zone",
      "exercise",
    ]));
    expect(dataTypes).not.toContain("heart-rate");
    expect(dataTypes).not.toContain("heart-rate-variability");
    expect(dataTypes).not.toContain("activity-level");
  });
});
