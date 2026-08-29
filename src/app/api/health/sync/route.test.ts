import { beforeEach, describe, expect, it, vi } from "vitest";

import { GOOGLE_HEALTH_SCOPES } from "@/integrations/google-health/client";
import { automaticGoogleHealthDataTypes } from "@/integrations/google-health/schedule";

const state = vi.hoisted(() => ({
  afterTasks: [] as Promise<unknown>[],
  drain: vi.fn(),
  jobs: [] as Array<Record<string, unknown>>,
}));

vi.mock("next/server", async (importOriginal) => {
  const original = await importOriginal<typeof import("next/server")>();
  return {
    ...original,
    after: (callback: () => Promise<unknown>) => {
      state.afterTasks.push(callback());
    },
  };
});

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => ({ id: "user-1" })) }));
vi.mock("@/lib/env", () => ({ isLocalPreviewMode: vi.fn(() => false) }));
vi.mock("@/services/health-data-coverage", () => ({ getHealthDataCoverage: vi.fn() }));
vi.mock("@/integrations/google-health/sync", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/integrations/google-health/sync")>();
  return { ...original, drainGoogleHealthSyncJob: state.drain };
});
vi.mock("@/lib/cloudflare/db", () => ({
  latestHealthRecordsByType: vi.fn(async () => []),
  healthSyncDiagnostics: vi.fn(),
  createCloudflareAdminClient: () => ({
    from: (table: string) => {
      const result = table === "sync_jobs"
        ? { data: state.jobs, error: null }
        : { data: { status: "connected", scopes: GOOGLE_HEALTH_SCOPES, last_synced_at: "2026-08-28T07:06:34.000Z" }, error: null };
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: () => Promise.resolve(result),
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
      };
      return query;
    },
  }),
}));

import { GET } from "./route";

describe("Google Health sync recovery", () => {
  beforeEach(() => {
    state.afterTasks.length = 0;
    state.drain.mockReset();
    state.drain.mockResolvedValue({ completed: false, progress: 20 });
    state.jobs = [{
      id: "manual-job",
      data_types: automaticGoogleHealthDataTypes(GOOGLE_HEALTH_SCOPES),
      status: "queued",
      progress: 3,
      error_code: null,
      error_message: null,
      cursor: { typeIndex: 1 },
      completed_at: null,
      created_at: "2026-08-29T06:50:00.000Z",
      started_at: null,
      retry_after: null,
      sync_trigger: "manual",
      import_range: "90_days",
    }];
  });

  it("advances a queued manual job while its status is being polled", async () => {
    const response = await GET(new Request("https://soma.example/api/health/sync"));
    await Promise.all(state.afterTasks);

    expect(response.status).toBe(200);
    expect(state.drain).toHaveBeenCalledWith("manual-job", {
      maxBatches: 6,
      maxDurationMs: 25_000,
      refreshAnalytics: true,
    });
  });

  it("respects the provider backoff before resuming a queued job", async () => {
    state.jobs[0].retry_after = "2999-08-29T07:30:00.000Z";

    const response = await GET(new Request("https://soma.example/api/health/sync"));
    await Promise.all(state.afterTasks);

    expect(response.status).toBe(200);
    expect(state.drain).not.toHaveBeenCalled();
  });

  it("keeps reporting the manual refresh when a newer webhook job exists", async () => {
    state.jobs.unshift({
      id: "newer-webhook",
      data_types: ["steps"],
      status: "completed",
      progress: 100,
      error_code: null,
      error_message: null,
      cursor: {},
      completed_at: "2026-08-29T07:00:00.000Z",
      created_at: "2026-08-29T07:00:00.000Z",
      sync_trigger: "webhook",
      import_range: "90_days",
    });

    const response = await GET(new Request("https://soma.example/api/health/sync"));
    const body = await response.json();
    await Promise.all(state.afterTasks);

    expect(body.status).toMatchObject({ jobId: "manual-job", phase: "queued", progress: 3 });
    expect(state.drain).toHaveBeenCalledWith("manual-job", expect.any(Object));
  });
});
