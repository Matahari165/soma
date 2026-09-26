import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  adminFrom: vi.fn(),
  claimLock: vi.fn(),
  releaseLock: vi.fn(),
  listPoints: vi.fn(),
  upserts: [] as Array<{ rows: unknown[]; options: unknown }>,
  recompute: vi.fn(),
}));

vi.mock("@/lib/crypto", () => ({ decryptSecret: vi.fn(() => "test-access-token"), encryptSecret: vi.fn(() => "encrypted-access-token") }));
vi.mock("@/lib/cloudflare/db", () => ({
  claimCloudflareLock: state.claimLock,
  createCloudflareAdminClient: () => ({ from: state.adminFrom }),
  releaseCloudflareLock: state.releaseLock,
}));
vi.mock("@/services/analysis", () => ({ recomputeUserHealth: state.recompute }));
vi.mock("./client", async (importOriginal) => {
  const original = await importOriginal<typeof import("./client")>();
  return { ...original, listGoogleHealthDataPoints: state.listPoints };
});

import {
  GOOGLE_HEALTH_ACTIVE_HOURS_PROVENANCE,
  GOOGLE_HEALTH_ACTIVE_HOURS_MARKER,
  googleHealthActiveHoursRange,
  isGoogleHealthActiveHoursSyncDue,
  syncGoogleHealthActiveHoursConnection,
} from "./active-hours";
import { GOOGLE_HEALTH_SCOPES } from "./client";

const now = new Date("2026-08-20T09:07:00.000Z");
const connection = {
  id: "connection-1",
  user_id: "user-1",
  status: "connected",
  scopes: [GOOGLE_HEALTH_SCOPES[0]],
  access_token_ciphertext: "ciphertext",
  refresh_token_ciphertext: null,
  token_expires_at: "2030-01-01T00:00:00.000Z",
  metadata: {},
  updated_at: "2026-08-20T09:00:00.000Z",
};

function configureAdmin() {
  state.adminFrom.mockImplementation((table: string) => {
    let operation = "read";
    let selected = "";
    const query = {
      select(columns: string) { selected = columns; return query; },
      update() { operation = "update"; return query; },
      upsert(rows: unknown[], options: unknown) {
        state.upserts.push({ rows: rows as unknown[], options });
        operation = "upsert";
        return query;
      },
      eq() { return query; },
      limit() { return query; },
      maybeSingle() {
        if (table === "provider_connections" && operation === "update") return Promise.resolve({ data: { id: connection.id }, error: null });
        if (table === "provider_connections" && selected === "metadata,updated_at") return Promise.resolve({ data: { metadata: {}, updated_at: connection.updated_at }, error: null });
        if (table === "provider_connections") return Promise.resolve({ data: connection, error: null });
        return Promise.resolve({ data: null, error: null });
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      },
    };
    return query;
  });
}

describe("Google Health active-hours collection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connection.scopes = [GOOGLE_HEALTH_SCOPES[0]];
    connection.metadata = {};
    state.upserts.length = 0;
    state.claimLock.mockResolvedValue(true);
    state.releaseLock.mockResolvedValue(undefined);
    state.recompute.mockResolvedValue({ days: 45 });
    configureAdmin();
  });

  it("uses an exact 48-hour physical range and a separate 15-minute cadence", () => {
    expect(googleHealthActiveHoursRange(now)).toEqual({
      start: new Date("2026-08-18T09:07:00.000Z"),
      end: now,
    });
    expect(isGoogleHealthActiveHoursSyncDue(now, null)).toBe(true);
    expect(isGoogleHealthActiveHoursSyncDue(now, "2026-08-20T09:05:00.000Z")).toBe(false);
    expect(isGoogleHealthActiveHoursSyncDue(new Date("2026-08-20T09:15:00.000Z"), "2026-08-20T09:05:00.000Z")).toBe(true);
  });

  it("paginates and upserts only steps and activity-level with intraday provenance", async () => {
    state.listPoints.mockImplementation(async ({ dataType, pageToken }: { dataType: string; pageToken?: string }) => {
      if (dataType === "steps") return { dataPoints: [
        { name: "steps-1", steps: { count: 12, interval: { startTime: "2026-08-20T08:00:00Z", endTime: "2026-08-20T08:01:00Z" } } },
        { name: "steps-1", steps: { count: 12, interval: { startTime: "2026-08-20T08:00:00Z", endTime: "2026-08-20T08:01:00Z" } } },
      ] };
      if (!pageToken) return { dataPoints: [
        { name: "activity-1", activityLevel: { interval: { startTime: "2026-08-20T08:00:00Z", endTime: "2026-08-20T08:01:00Z" } } },
      ], nextPageToken: "opaque-page-token" };
      return { dataPoints: [
        { name: "activity-2", activityLevel: { interval: { startTime: "2026-08-20T08:01:00Z", endTime: "2026-08-20T08:02:00Z" } } },
      ] };
    });

    const result = await syncGoogleHealthActiveHoursConnection("connection-1", {
      now,
      collectionDeadlineAt: Date.now() + 20_000,
      deadlineAt: Date.now() + 48_000,
    });

    expect(result).toMatchObject({ status: "completed", records: 3, dataTypes: ["steps", "activity-level"] });
    expect(state.claimLock).toHaveBeenCalledWith("google-health-active-hours:connection-1", "user-1", expect.any(Number));
    expect(state.releaseLock).toHaveBeenCalledWith("google-health-active-hours:connection-1", "user-1");
    expect(state.listPoints.mock.calls.map(([input]) => input.dataType)).toEqual(["steps", "activity-level", "activity-level"]);
    expect(state.listPoints.mock.calls.every(([input]) => input.start.toISOString() === "2026-08-18T09:07:00.000Z" && input.end.toISOString() === now.toISOString())).toBe(true);
    expect(state.listPoints.mock.calls[2]?.[0].pageToken).toBe("opaque-page-token");
    expect(state.upserts).toHaveLength(3);
    expect(state.upserts[0]?.rows).toHaveLength(1);
    expect((state.upserts[0]?.rows[0] as { payload: { soma: { provenance: string } } }).payload.soma.provenance).toBe(GOOGLE_HEALTH_ACTIVE_HOURS_PROVENANCE);
    for (const { options } of state.upserts) {
      expect(options).toMatchObject({ onConflict: "user_id,provider,data_type,source_record_id" });
    }
    expect(state.recompute).toHaveBeenCalledWith("user-1", { windowDays: 45 });
  });

  it("skips a connection already synchronized in the current slot", async () => {
    const recentConnection = { ...connection, metadata: { [GOOGLE_HEALTH_ACTIVE_HOURS_MARKER]: "2026-08-20T09:05:00.000Z" } };
    state.adminFrom.mockImplementation(() => ({
      select() { return this; },
      eq() { return this; },
      maybeSingle() { return Promise.resolve({ data: recentConnection, error: null }); },
    }));

    const result = await syncGoogleHealthActiveHoursConnection("connection-1", { now });

    expect(result.status).toBe("skipped");
    expect(state.claimLock).not.toHaveBeenCalled();
    expect(state.listPoints).not.toHaveBeenCalled();
  });

  it("does not call Google or analysis without the activity scope", async () => {
    connection.scopes = [];

    const result = await syncGoogleHealthActiveHoursConnection("connection-1", { now });

    expect(result).toMatchObject({ status: "completed", records: 0, dataTypes: [] });
    expect(state.listPoints).not.toHaveBeenCalled();
    expect(state.recompute).not.toHaveBeenCalled();
  });

  it("stops at the page budget and leaves the slot retryable", async () => {
    state.listPoints.mockResolvedValue({ dataPoints: [], nextPageToken: "next-page" });

    await expect(syncGoogleHealthActiveHoursConnection("connection-1", { now })).rejects.toThrow("page budget");

    expect(state.listPoints).toHaveBeenCalledTimes(10);
    expect(state.recompute).not.toHaveBeenCalled();
    expect(state.releaseLock).toHaveBeenCalledWith("google-health-active-hours:connection-1", "user-1");
  });

  it("leaves collected records retryable while another analysis owns the shared lock", async () => {
    state.claimLock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    state.listPoints.mockImplementation(async ({ dataType }: { dataType: string }) => ({
      dataPoints: dataType === "steps"
        ? [{ name: "steps-1", steps: { interval: { startTime: "2026-08-20T08:00:00Z", endTime: "2026-08-20T08:01:00Z" } } }]
        : [],
    }));

    await expect(syncGoogleHealthActiveHoursConnection("connection-1", { now })).rejects.toThrow("already in progress");

    expect(state.upserts).toHaveLength(1);
    expect(state.recompute).not.toHaveBeenCalled();
    expect(state.releaseLock).toHaveBeenCalledTimes(1);
    expect(state.releaseLock).toHaveBeenCalledWith("google-health-active-hours:connection-1", "user-1");
  });
});
