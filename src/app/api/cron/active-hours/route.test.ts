import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  adminFrom: vi.fn(),
  syncConnection: vi.fn(),
}));

vi.mock("@/lib/cloudflare/db", () => ({ createCloudflareAdminClient: () => ({ from: state.adminFrom }) }));
vi.mock("@/integrations/google-health/active-hours", () => ({
  GOOGLE_HEALTH_ACTIVE_HOURS_MARKER: "active_hours_last_synced_at",
  isGoogleHealthActiveHoursSyncDue: (now: Date, lastSyncedAt: unknown) => typeof lastSyncedAt !== "string" || Date.parse(lastSyncedAt) < Math.floor(now.getTime() / 900_000) * 900_000,
  syncGoogleHealthActiveHoursConnection: state.syncConnection,
}));

import { GET } from "./route";

describe("active-hours cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-test-secret";
    state.syncConnection.mockResolvedValue({ status: "completed", records: 2, dataTypes: ["steps", "activity-level"] });
    state.adminFrom.mockImplementation(() => {
      const query = {
        select() { return query; },
        eq() { return query; },
        limit() { return query; },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve({ data: [{ id: "connection-1", metadata: {} }], error: null }).then(resolve, reject);
        },
      };
      return query;
    });
  });

  it("requires the machine cron secret without loading health connections", async () => {
    const response = await GET(new Request("https://soma.example/api/cron/active-hours"));

    expect(response.status).toBe(401);
    expect(state.adminFrom).not.toHaveBeenCalled();
    expect(state.syncConnection).not.toHaveBeenCalled();
  });

  it("schedules only due connections and returns no health details", async () => {
    const response = await GET(new Request("https://soma.example/api/cron/active-hours", {
      headers: { authorization: "Bearer cron-test-secret" },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ processed: true });
    expect(state.syncConnection).toHaveBeenCalledOnce();
  });

  it("retries on the next worker tick after a collection failure", async () => {
    state.syncConnection.mockRejectedValue(new Error("provider response must not be returned"));

    const response = await GET(new Request("https://soma.example/api/cron/active-hours", {
      headers: { authorization: "Bearer cron-test-secret" },
    }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Google Health active-hours collection will retry." });
  });

  it("defers without failing the clock while shared analysis is occupied", async () => {
    state.syncConnection.mockRejectedValue(new Error("Health analysis is already in progress."));

    const response = await GET(new Request("https://soma.example/api/cron/active-hours", {
      headers: { authorization: "Bearer cron-test-secret" },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ processed: true, deferred: true });
  });

  it("reports a per-connection lock as deferred", async () => {
    state.syncConnection.mockResolvedValue({ status: "locked", records: 0, dataTypes: [] });

    const response = await GET(new Request("https://soma.example/api/cron/active-hours", {
      headers: { authorization: "Bearer cron-test-secret" },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ processed: true, deferred: true });
  });
});
