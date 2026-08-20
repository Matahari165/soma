import { describe, expect, it } from "vitest";

import { getGoogleHealthNotice, syncPhaseFor, toSyncStatus } from "./status";

describe("Google Health connection notices", () => {
  it("keeps an OAuth refusal separate from a technical failure", () => {
    expect(getGoogleHealthNotice("permission_denied")).toMatchObject({ tone: "neutral" });
    expect(getGoogleHealthNotice("connection_failed")).toMatchObject({ tone: "error" });
  });

  it("explains partial consent without treating it as a failure", () => {
    expect(getGoogleHealthNotice("connected_partial")).toMatchObject({ tone: "neutral" });
  });

  it("explains that onboarding data is preserved during an outage", () => {
    expect(getGoogleHealthNotice("unavailable")?.message).toContain("profile is saved");
  });

  it("ignores unknown query values", () => {
    expect(getGoogleHealthNotice("unexpected")).toBeNull();
  });
});

describe("Google Health sync status", () => {
  it("distinguishes fetching, materializing, retrying, and reconnect states", () => {
    expect(syncPhaseFor({ id: "1", status: "running", progress: 70, cursor: {} })).toBe("fetching");
    expect(syncPhaseFor({ id: "1", status: "running", progress: 99, cursor: { phase: "materializing" } })).toBe("materializing");
    expect(syncPhaseFor({ id: "1", status: "queued", progress: 40, error_code: "GOOGLE_HEALTH_RATE_LIMITED" })).toBe("retrying");
    expect(syncPhaseFor({ id: "1", status: "failed", progress: 40, error_code: "GOOGLE_HEALTH_AUTH_EXPIRED" })).toBe("needs_reconnect");
  });

  it("returns a public typed status", () => {
    expect(toSyncStatus(null, {}, false)).toEqual({ jobId: "none", phase: "up_to_date", progress: 100, perType: {}, lastError: null, retryable: false });
  });

  it("keeps a completed import partial when one permitted type was isolated", () => {
    const status = toSyncStatus({ id: "1", status: "completed", progress: 100, cursor: { typeErrors: { steps: "GOOGLE_HEALTH_PERMISSION_DENIED" } } }, {});
    expect(status).toMatchObject({ phase: "partial", retryable: false });
    expect(status.lastError).toContain("could not be imported");
  });
});
