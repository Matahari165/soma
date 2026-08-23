import { describe, expect, it } from "vitest";

import { GoogleHealthRequestError } from "./client";
import { normalizeGoogleHealthPoint } from "./normalize";
import { classifyGoogleHealthSyncError, deduplicateGoogleHealthRecords, shouldRefreshAnalyticsForTrigger, usesDirectGoogleHealthUpsert } from "./sync";

describe("Google Health sync failures", () => {
  it("requires reconnection for an expired token but isolates a denied data type", () => {
    expect(classifyGoogleHealthSyncError(new GoogleHealthRequestError(401, "expired"))).toMatchObject({ retryable: false, connectionStatus: "expired" });
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
});
