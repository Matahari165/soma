import { describe, expect, it } from "vitest";

import { GoogleHealthRequestError } from "./client";
import { normalizeGoogleHealthPoint } from "./normalize";
import { classifyGoogleHealthSyncError, deduplicateGoogleHealthRecords, googleHealthAnalyticsRequestForJob, googleHealthAnalyticsLookbackDaysForTrigger, googleHealthSyncRangeStart, googleHealthSyncRuntimeState, selectNextGoogleHealthSyncJob, shouldRefreshAnalyticsForTrigger, usesDirectGoogleHealthUpsert } from "./sync";

describe("Google Health sync failures", () => {
  it("requires reconnection for an expired token but isolates a denied data type", () => {
    expect(classifyGoogleHealthSyncError(new GoogleHealthRequestError(401, "expired"))).toMatchObject({ retryable: false, connectionStatus: "expired" });
    expect(classifyGoogleHealthSyncError(new GoogleHealthRequestError(400, "invalid_grant", "token"))).toMatchObject({ code: "GOOGLE_HEALTH_AUTH_EXPIRED", retryable: false, connectionStatus: "expired" });
    expect(classifyGoogleHealthSyncError(new Error("Unsupported state or unable to authenticate data"))).toMatchObject({ code: "GOOGLE_HEALTH_AUTH_EXPIRED", retryable: false, connectionStatus: "expired" });
    expect(classifyGoogleHealthSyncError(new GoogleHealthRequestError(403, "partial consent"))).toMatchObject({ retryable: false, connectionStatus: "connected", code: "GOOGLE_HEALTH_PERMISSION_DENIED" });
  });

  it("keeps transient failures retryable without breaking the connection", () => {
    expect(classifyGoogleHealthSyncError(new GoogleHealthRequestError(429, "limited"))).toMatchObject({ retryable: true, connectionStatus: "connected" });
    expect(classifyGoogleHealthSyncError(new GoogleHealthRequestError(503, "unavailable"))).toMatchObject({ retryable: true, connectionStatus: "connected" });
  });

  it("defers full analysis for webhook batches", () => {
    expect(shouldRefreshAnalyticsForTrigger("webhook")).toBe(false);
    expect(shouldRefreshAnalyticsForTrigger("automatic")).toBe(true);
    expect(shouldRefreshAnalyticsForTrigger("initial")).toBe(true);
    expect(shouldRefreshAnalyticsForTrigger("manual")).toBe(true);
  });

  it("requests short analytics for automatic jobs and 90 days for historical/manual jobs", () => {
    expect(googleHealthAnalyticsLookbackDaysForTrigger("automatic")).toBe(45);
    expect(googleHealthAnalyticsLookbackDaysForTrigger("webhook")).toBe(45);
    expect(googleHealthAnalyticsLookbackDaysForTrigger("manual")).toBe(90);
    expect(googleHealthAnalyticsLookbackDaysForTrigger("initial")).toBe(90);
    expect(googleHealthAnalyticsRequestForJob({ sync_trigger: "automatic" })).toMatchObject({ lookbackDays: 45, backfillVersion: null });
    expect(googleHealthAnalyticsRequestForJob({ sync_trigger: "manual" })).toMatchObject({ lookbackDays: 90, backfillVersion: 1 });
    expect(googleHealthAnalyticsRequestForJob({ sync_trigger: "initial" })).toMatchObject({ lookbackDays: 90, backfillVersion: 1 });
    expect(googleHealthAnalyticsRequestForJob({ sync_trigger: "webhook" })).toMatchObject({ lookbackDays: 45, backfillVersion: null });
  });

  it("publishes high-frequency series page by page", () => {
    expect(usesDirectGoogleHealthUpsert("heart-rate")).toBe(true);
    expect(usesDirectGoogleHealthUpsert("heart-rate-variability")).toBe(true);
    expect(usesDirectGoogleHealthUpsert("activity-level")).toBe(true);
    expect(usesDirectGoogleHealthUpsert("sleep")).toBe(false);
    expect(usesDirectGoogleHealthUpsert("daily-resting-heart-rate")).toBe(false);
  });

  it("keeps one record when Google returns the same source record twice", () => {
    const first = normalizeGoogleHealthPoint("user-1", "sleep", { name: "sleep-record-1", sleepSession: { revision: 1 } });
    const revised = normalizeGoogleHealthPoint("user-1", "sleep", { name: "sleep-record-1", sleepSession: { revision: 2 } });

    expect(deduplicateGoogleHealthRecords([first, revised])).toEqual([revised]);
  });

  it("keeps raw heart-rate online for 7 days without shortening other history", () => {
    const requestedStart = new Date("2026-01-01T00:00:00.000Z");
    const rangeEnd = new Date("2026-08-24T00:00:00.000Z");

    expect(googleHealthSyncRangeStart("heart-rate", requestedStart, rangeEnd).toISOString()).toBe("2026-08-17T00:00:00.000Z");
    expect(googleHealthSyncRangeStart("daily-heart-rate-variability", requestedStart, rangeEnd)).toBe(requestedStart);
  });

  it("initializes missing D1 cursor and attempt values", () => {
    expect(googleHealthSyncRuntimeState({ cursor: null, attempts: null })).toEqual({ cursor: {}, attempts: 0 });
    expect(googleHealthSyncRuntimeState({ cursor: { typeIndex: 2 }, attempts: 1 })).toEqual({ cursor: { typeIndex: 2 }, attempts: 1 });
  });

  it("keeps recurring freshness ahead of an initial recent import", () => {
    const jobs = [
      { id: "automatic", sync_trigger: "automatic", import_range: "90_days", created_at: "2026-08-25T07:00:00.000Z" },
      { id: "history", sync_trigger: "initial", import_range: "all_history", created_at: "2026-08-25T06:00:00.000Z" },
      { id: "recent", sync_trigger: "initial", import_range: "90_days", created_at: "2026-08-25T06:00:00.000Z" },
    ];
    expect(selectNextGoogleHealthSyncJob(jobs)?.id).toBe("automatic");
  });

  it("keeps recurring refreshes ahead of the older full-history backfill", () => {
    const jobs = [
      { id: "history", sync_trigger: "initial", import_range: "all_history", created_at: "2026-08-25T06:00:00.000Z" },
      { id: "automatic", sync_trigger: "automatic", import_range: "90_days", created_at: "2026-08-25T07:00:00.000Z" },
    ];
    expect(selectNextGoogleHealthSyncJob(jobs)?.id).toBe("automatic");
  });

  it("keeps current automatic work ahead of older raw webhook jobs", () => {
    const jobs = [
      { id: "webhook", sync_trigger: "webhook", import_range: "90_days", created_at: "2026-08-25T06:00:00.000Z" },
      { id: "automatic", sync_trigger: "automatic", import_range: "90_days", created_at: "2026-08-25T07:00:00.000Z" },
    ];
    expect(selectNextGoogleHealthSyncJob(jobs)?.id).toBe("automatic");
  });
});
