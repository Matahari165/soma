import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  fetch: vi.fn(),
  stored: [] as Array<Record<string, unknown>>,
  connected: true,
  personalBpm: 200 as number | null,
  timeZone: "UTC",
  dateOfBirth: "1986-02-01" as string | null,
  zoneFetch: vi.fn(),
}));
vi.mock("@/lib/crypto", () => ({ decryptSecret: () => "synthetic-token", encryptSecret: () => "synthetic-ciphertext" }));
vi.mock("@/lib/r2", () => ({ getR2ArchiveObject: vi.fn() }));
vi.mock("@/integrations/google-health/client", () => ({
  GOOGLE_HEALTH_SCOPES: ["activity", "heart"],
  refreshGoogleHealthToken: vi.fn(),
  rollUpGoogleHealthSessionHeartRate: async () => ({}),
}));
vi.mock("@/integrations/google-health/session-heart-rate", () => ({
  fetchGoogleHealthSessionHeartRate: state.fetch,
  fetchGoogleHealthSessionDailyZones: state.zoneFetch,
}));
vi.mock("@/integrations/google-health/normalize", () => ({
  normalizeGoogleHealthPoint: (_user: string, _type: string, point: Record<string, unknown>) => point,
}));
vi.mock("@/lib/cloudflare/db", () => ({
  createCloudflareAdminClient: () => ({
    from: (table: string) => {
      let dataType = "";
      const result = () => ({ data: table === "health_record_archives" ? [] : dataType === "heart-rate" ? state.rows : [], error: null });
      const query = {
        select: () => query,
        eq: (column: string, value: string) => { if (column === "data_type") dataType = value; return query; },
        gte: () => query, lte: () => query, lt: () => query, gt: () => query,
        order: () => query, limit: () => query, in: () => query,
        range: async () => result(),
        maybeSingle: async () => ({ data: table === "profiles" ? { timezone: state.timeZone, date_of_birth: state.dateOfBirth, maximum_heart_rate_bpm: state.personalBpm } : state.connected ? {
          id: "synthetic-connection", status: "connected", scopes: ["heart"],
          access_token_ciphertext: "synthetic-ciphertext", token_expires_at: "2099-01-01T00:00:00Z",
        } : null, error: null }),
        upsert: async (rows: Array<Record<string, unknown>>) => { state.stored.push(...rows); return { error: null }; },
        then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return query;
    },
  }),
}));

import { getActivitySessionTelemetry } from "./activity-session-telemetry";

const startTime = "2026-09-24T10:00:00.000Z";
const at = (seconds: number) => new Date(Date.parse(startTime) + seconds * 1_000).toISOString();
const row = (seconds: number, bpm = 120) => ({
  source_record_id: `synthetic-${seconds}`, civil_date: "2026-09-24", measured_at: at(seconds),
  payload: { heartRate: { beatsPerMinute: bpm } },
});
const range = { startTime, endTime: at(40), date: "2026-09-24" };

describe("workout heart-rate completion", () => {
  beforeEach(() => {
    state.rows = [row(0), row(10)];
    state.stored = [];
    state.connected = true;
    state.personalBpm = 200;
    state.timeZone = "UTC";
    state.dateOfBirth = "1986-02-01";
    state.zoneFetch.mockReset();
    state.fetch.mockReset();
    state.fetch.mockResolvedValue({ dataPoints: [row(10), row(20), row(30), row(40)], limited: false });
  });

  it("completes a partial import and preserves earlier samples without duplicating overlaps", async () => {
    const result = await getActivitySessionTelemetry("synthetic-user", range);
    expect(state.fetch).toHaveBeenCalledOnce();
    expect(result.heartRateSampleCount).toBe(5);
    expect(result.coverage.percent).toBe(100);
    expect(result.heartRateFetchStatus).toBe("fetched");
    expect(state.stored).toHaveLength(4);
    expect(state.zoneFetch).not.toHaveBeenCalled();
    expect(result.calculatedZones?.maximumHeartRate).toEqual({ bpm: 200, source: "personal" });
    expect(result.calculatedZones?.seconds.z2).toBe(40);
  });

  it("uses an explicitly estimated reference if the personal maximum is absent", async () => {
    state.personalBpm = null;
    const result = await getActivitySessionTelemetry("synthetic-user", range);
    expect(result.calculatedZones?.maximumHeartRate).toEqual({ bpm: 180, source: "age_estimate" });
    expect(state.zoneFetch).not.toHaveBeenCalled();
  });

  it("preserves readings and age-based zones when the profile timezone is invalid", async () => {
    state.timeZone = "Invalid/Timezone";
    state.personalBpm = null;
    state.connected = false;
    state.rows = [row(0), row(10), row(20), row(30), row(40)];
    const result = await getActivitySessionTelemetry("synthetic-user", range);
    expect(result.heartRateSampleCount).toBe(5);
    expect(result.calculatedZones?.maximumHeartRate).toEqual({ bpm: 180, source: "age_estimate" });
    expect(result.coverage.percent).toBe(100);
  });

  it("keeps the trace without inventing zone thresholds when no reference can be resolved", async () => {
    state.personalBpm = null;
    state.dateOfBirth = null;
    const result = await getActivitySessionTelemetry("synthetic-user", range);
    expect(result.heartRateSampleCount).toBe(5);
    expect(result.calculatedZones).toBeNull();
  });

  it("keeps imported readings and reports failure if Google is unavailable", async () => {
    state.fetch.mockRejectedValue(new Error("synthetic upstream failure"));
    const result = await getActivitySessionTelemetry("synthetic-user", range);
    expect(result.heartRateSampleCount).toBe(2);
    expect(result.coverage.percent).toBe(25);
    expect(result.heartRateFetchStatus).toBe("failed");
    expect(state.stored).toEqual([]);
  });

  it("does not download again when the stored active trace is complete", async () => {
    state.rows = [0, 10, 20, 30, 40].map((seconds) => row(seconds));
    const result = await getActivitySessionTelemetry("synthetic-user", range);
    expect(state.fetch).not.toHaveBeenCalled();
    expect(result.heartRateFetchStatus).toBe("not_needed");
  });

  it("keeps partial data when the heart-rate permission or connection is missing", async () => {
    state.connected = false;
    const result = await getActivitySessionTelemetry("synthetic-user", range);
    expect(state.fetch).not.toHaveBeenCalled();
    expect(result.heartRateFetchStatus).toBe("unavailable");
    expect(result.heartRateSampleCount).toBe(2);
  });

  it("retains honest coverage and pagination status on a bounded response", async () => {
    state.fetch.mockResolvedValue({ dataPoints: [row(10), row(20)], limited: true });
    const result = await getActivitySessionTelemetry("synthetic-user", range);
    expect(result.heartRateFetchLimited).toBe(true);
    expect(result.coverage.percent).toBe(50);
  });
});


it("stores a fetched page before checkpointing its provider continuation", async () => {
  state.rows = [];
  state.stored = [];
  state.connected = true;
  state.fetch.mockImplementationOnce(async (options) => {
    await options.onPage([row(0)], "page-two");
    throw new Error("synthetic interrupted fetch");
  });
  const checkpoint = vi.fn(async (token) => {
    expect(state.stored).toHaveLength(1);
    expect(token).toBe("page-two");
  });
  await expect(getActivitySessionTelemetry("synthetic-user", range, { onHeartRatePage: checkpoint })).rejects.toThrow("synthetic interrupted fetch");
  expect(checkpoint).toHaveBeenCalledOnce();
});

it("skips an already completed raw fetch when resuming the final rollup", async () => {
  state.rows = [row(0), row(10)];
  state.connected = true;
  state.fetch.mockClear();
  const result = await getActivitySessionTelemetry("synthetic-user", range, { skipHeartRateFetch: true });
  expect(state.fetch).not.toHaveBeenCalled();
  expect(result.coverage.percent).toBeLessThan(100);
});
