import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  adminFrom: vi.fn(),
  claimCloudflareLock: vi.fn(),
  releaseCloudflareLock: vi.fn(),
  recomputeUserHealth: vi.fn(),
  providerUpdateValues: [] as unknown[],
  syncUpdateValues: [] as unknown[],
}));

vi.mock("@/lib/crypto", () => ({
  decryptSecret: vi.fn(),
  encryptSecret: vi.fn(),
  stableHash: vi.fn(() => "hash"),
}));
vi.mock("@/lib/cloudflare/db", () => ({
  claimCloudflareLock: testState.claimCloudflareLock,
  createCloudflareAdminClient: () => ({ from: testState.adminFrom }),
  releaseCloudflareLock: testState.releaseCloudflareLock,
}));
vi.mock("@/services/analysis", () => ({
  DEFAULT_ANALYSIS_WINDOW_DAYS: 45,
  HISTORICAL_ANALYSIS_WINDOW_DAYS: 90,
  recomputeUserHealth: testState.recomputeUserHealth,
}));

import { drainGoogleHealthSyncJob, processGoogleHealthSyncJob } from "./sync";
import { GOOGLE_HEALTH_SCOPES } from "./client";

const baseJob = {
  id: "job-1",
  user_id: "user-1",
  connection_id: "connection-1",
  import_range: "90_days",
  data_types: ["sleep"],
  range_start: "2026-05-22T09:05:00.000Z",
  range_end: "2026-08-20T09:05:00.000Z",
  cursor: { typeIndex: 1 },
  attempts: 0,
  progress: 99,
  status: "queued",
  sync_trigger: "initial",
};

function configureAdmin(job = baseJob, connection: {
  id: string;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string | null;
  token_expires_at: string | null;
  scopes?: string[];
  metadata: Record<string, unknown>;
} = {
  id: "connection-1",
  access_token_ciphertext: "cipher",
  refresh_token_ciphertext: null,
  token_expires_at: null,
  metadata: { consent_complete: true },
}) {
  testState.adminFrom.mockImplementation((table: string) => {
    const query = {
      operation: "read",
      values: null as unknown,
      select() { return query; },
      update(values: unknown) {
        query.operation = "update";
        query.values = values;
        if (table === "provider_connections") testState.providerUpdateValues.push(values);
        if (table === "sync_jobs") testState.syncUpdateValues.push(values);
        return query;
      },
      eq() { return query; },
      single() {
        if (table === "sync_jobs") return Promise.resolve({ data: job, error: null });
        return Promise.resolve({ data: connection, error: null });
      },
      maybeSingle() {
        return Promise.resolve({ data: { ...job, status: "running" }, error: null });
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      },
    };
    return query;
  });
}

describe("Google Health sync analytics materialization", () => {
  beforeEach(() => {
    testState.claimCloudflareLock.mockReset();
    testState.claimCloudflareLock.mockResolvedValue(true);
    testState.releaseCloudflareLock.mockReset();
    testState.releaseCloudflareLock.mockResolvedValue(undefined);
    testState.recomputeUserHealth.mockReset();
    testState.recomputeUserHealth.mockResolvedValue({ days: 90, scores: 0, insights: 0 });
    testState.providerUpdateValues.length = 0;
    testState.syncUpdateValues.length = 0;
    configureAdmin();
  });

  afterEach(() => vi.clearAllMocks());

  it("recomputes 90 days and records the completed historical backfill", async () => {
    const result = await processGoogleHealthSyncJob("job-1");

    expect(result).toMatchObject({ completed: true, analyticsRefreshed: true, analyticsRequest: { lookbackDays: 90, backfillVersion: 1 } });
    expect(testState.recomputeUserHealth).toHaveBeenCalledWith("user-1", { windowDays: 90 });
    expect(testState.providerUpdateValues.at(-1)).toMatchObject({ metadata: { consent_complete: true, analytics_backfill_version: 1 } });
    expect(testState.releaseCloudflareLock).toHaveBeenCalledWith("google-health-sync-job:job-1", "user-1");
  });

  it("keeps recurring automatic analysis at 45 days without a backfill marker", async () => {
    await processGoogleHealthSyncJob("job-1", { refreshAnalytics: true });
    const automaticJob = { ...baseJob, sync_trigger: "automatic" };
    testState.providerUpdateValues.length = 0;
    configureAdmin(automaticJob);

    const result = await processGoogleHealthSyncJob("job-1", { refreshAnalytics: true });

    expect(result).toMatchObject({ analyticsRequest: { lookbackDays: 45, backfillVersion: null } });
    expect(testState.recomputeUserHealth).toHaveBeenLastCalledWith("user-1", { windowDays: 45 });
    expect(testState.providerUpdateValues.at(-1)).toMatchObject({ metadata: { consent_complete: true } });
    expect(testState.providerUpdateValues.at(-1)).not.toMatchObject({ metadata: { analytics_backfill_version: 1 } });
  });

  it("skips a job already claimed by another worker", async () => {
    testState.claimCloudflareLock.mockResolvedValue(false);

    const result = await processGoogleHealthSyncJob("job-1");

    expect(result).toMatchObject({ skipped: true, completed: false });
    expect(testState.recomputeUserHealth).not.toHaveBeenCalled();
  });

  it("serializes initial and recurring work for one connection", async () => {
    const result = await drainGoogleHealthSyncJob("job-1", { maxBatches: 1, maxDurationMs: 10_000 });

    expect(result).toMatchObject({ completed: true });
    expect(testState.claimCloudflareLock).toHaveBeenNthCalledWith(
      1,
      "google-health-sync-connection:connection-1",
      "user-1",
      60_000,
    );
    expect(testState.releaseCloudflareLock).toHaveBeenCalledWith("google-health-sync-connection:connection-1", "user-1");
  });

  it("migrates an old automatic job before importing its next batch", async () => {
    const automaticJob = {
      ...baseJob,
      data_types: ["sleep", "oxygen-saturation"],
      cursor: { typeIndex: 1, windowStart: baseJob.range_start },
      sync_trigger: "automatic",
      progress: 73,
    };
    configureAdmin(automaticJob, {
      id: "connection-1",
      access_token_ciphertext: "cipher",
      refresh_token_ciphertext: null,
      token_expires_at: null,
      scopes: [...GOOGLE_HEALTH_SCOPES],
      metadata: { consent_complete: true },
    });

    const result = await processGoogleHealthSyncJob("job-1", { refreshAnalytics: true });

    expect(result).toMatchObject({ skipped: true, migrated: true, progress: 0 });
    expect(testState.syncUpdateValues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        data_types: expect.arrayContaining(["sleep", "daily-heart-rate-variability", "exercise"]),
        cursor: { typeIndex: 0, windowStart: baseJob.range_start },
        progress: 0,
        attempts: 0,
        status: "queued",
        started_at: null,
      }),
    ]));
  });

  it("also migrates a Takeout-seeded initial repair before importing its next batch", async () => {
    const takeoutJob = {
      ...baseJob,
      data_types: ["sleep", "oxygen-saturation"],
      cursor: { typeIndex: 1, windowStart: baseJob.range_start },
      progress: 73,
    };
    configureAdmin(takeoutJob, {
      id: "connection-1",
      access_token_ciphertext: "cipher",
      refresh_token_ciphertext: null,
      token_expires_at: null,
      scopes: [...GOOGLE_HEALTH_SCOPES],
      metadata: { takeout_imported_through: "2026-08-22" },
    });

    const result = await processGoogleHealthSyncJob("job-1", { refreshAnalytics: true });

    expect(result).toMatchObject({ skipped: true, migrated: true, progress: 0 });
    expect(testState.syncUpdateValues).toEqual(expect.arrayContaining([
      expect.objectContaining({ data_types: expect.not.arrayContaining(["oxygen-saturation"]) }),
    ]));
  });
});
