import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  adminFrom: vi.fn(),
  claimCloudflareLock: vi.fn(),
  releaseCloudflareLock: vi.fn(),
  recomputeUserHealth: vi.fn(),
  providerUpdateValues: [] as unknown[],
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

import { processGoogleHealthSyncJob } from "./sync";

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

function configureAdmin(job = baseJob) {
  testState.adminFrom.mockImplementation((table: string) => {
    const query = {
      operation: "read",
      values: null as unknown,
      select() { return query; },
      update(values: unknown) {
        query.operation = "update";
        query.values = values;
        if (table === "provider_connections") testState.providerUpdateValues.push(values);
        return query;
      },
      eq() { return query; },
      single() {
        if (table === "sync_jobs") return Promise.resolve({ data: job, error: null });
        return Promise.resolve({ data: { id: "connection-1", access_token_ciphertext: "cipher", refresh_token_ciphertext: null, token_expires_at: null, metadata: { consent_complete: true } }, error: null });
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
});
