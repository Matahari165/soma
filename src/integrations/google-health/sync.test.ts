import { describe, expect, it } from "vitest";

import { GoogleHealthRequestError } from "./client";
import { classifyGoogleHealthSyncError, shouldRefreshAnalyticsForTrigger } from "./sync";

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
});
