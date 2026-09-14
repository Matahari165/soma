import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GOOGLE_HEALTH_SCOPES } from "@/integrations/google-health/client";

const testState = vi.hoisted(() => ({
  adminFrom: vi.fn(),
  claimCloudflareLock: vi.fn(),
  inserts: [] as Array<{ table: string; values: unknown; options?: unknown }>,
  openJobs: [] as Array<Record<string, unknown>>,
  connectionMetadata: { takeout_imported_through: "2026-08-19" } as Record<string, unknown>,
}));

vi.mock("@/lib/env", () => ({ requireServerEnv: () => "cron-secret" }));
vi.mock("@/lib/cloudflare/db", () => ({
  createCloudflareAdminClient: () => ({ from: testState.adminFrom }),
  claimCloudflareLock: testState.claimCloudflareLock,
}));
vi.mock("@/integrations/google-health/sync", () => ({
  drainGoogleHealthSyncJob: vi.fn(),
  selectNextGoogleHealthSyncJob: vi.fn(() => null),
  shouldRefreshAnalyticsForTrigger: vi.fn(() => true),
}));
vi.mock("@/integrations/google-calendar/sync", () => ({ syncGoogleCalendar: vi.fn() }));

import { GET } from "./route";

const connection = {
  id: "connection-1",
  user_id: "user-1",
  scopes: [...GOOGLE_HEALTH_SCOPES],
  last_lab_synced_at: "2026-08-20T08:00:00.000Z",
  metadata: { takeout_imported_through: "2026-08-19" },
};

function configureAdmin() {
  testState.adminFrom.mockImplementation((table: string) => {
    const query = {
      selector: "*",
      operation: "read",
      values: null as unknown,
      select(selector = "*") { query.selector = selector; return query; },
      update(values: unknown) { query.operation = "update"; query.values = values; return query; },
      insert(values: unknown) {
        query.operation = "insert";
        query.values = values;
        testState.inserts.push({ table, values });
        return query;
      },
      upsert(values: unknown, options?: unknown) {
        query.operation = "upsert";
        query.values = values;
        testState.inserts.push({ table, values, options });
        return query;
      },
      eq() { return query; },
      in() { return query; },
      lt() { return query; },
      or() { return query; },
      order() { return query; },
      limit() { return query; },
      maybeSingle() { return Promise.resolve(valueFor(table, query)); },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(valueFor(table, query)).then(resolve, reject);
      },
    };
    return query;
  });
}

function valueFor(table: string, query: { selector: string; operation: string }) {
  if (query.operation === "insert" || query.operation === "update") return { data: [], error: null };
  if (table === "provider_connections" && query.selector.includes("last_lab_synced_at")) {
    return { data: [{ ...connection, metadata: testState.connectionMetadata }], error: null };
  }
  if (table === "provider_connections" && query.selector === "user_id,last_synced_at") return { data: null, error: null };
  if (table === "profiles") return { data: [{ user_id: "user-1", timezone: "Europe/Paris" }], error: null };
  if (table === "webhook_events") return { data: [], error: null };
  if (table === "sync_jobs" && query.selector.includes("scheduled_civil_date")) return { data: testState.openJobs, error: null };
  if (table === "sync_jobs" && query.selector === "connection_id") return { data: [], error: null };
  if (table === "sync_jobs") return { data: [], error: null };
  return { data: [], error: null };
}

describe("Google Health cron historical repair", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T09:05:00.000Z"));
    testState.inserts.length = 0;
    testState.openJobs = [];
    testState.connectionMetadata = { takeout_imported_through: "2026-08-19" };
    testState.claimCloudflareLock.mockReset();
    testState.claimCloudflareLock.mockResolvedValue(true);
    configureAdmin();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("queues a single 90-day repair without high-volume webhook streams", async () => {
    const response = await GET(new Request("https://soma.example/api/cron/sync", { headers: { authorization: "Bearer cron-secret" } }));

    expect(response.status).toBe(200);
    const jobs = testState.inserts.filter((insert) => insert.table === "sync_jobs").map((insert) => insert.values as Record<string, unknown>);
    const backfill = testState.inserts.find((insert) => insert.table === "sync_jobs");
    expect(backfill?.options).toEqual({ onConflict: "connection_id,idempotency_key", ignoreDuplicates: true });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      connection_id: "connection-1",
      import_range: "90_days",
      sync_trigger: "initial",
      idempotency_key: "google-health-analytics-backfill-v1",
      range_start: "2026-05-22T09:05:00.000Z",
      range_end: "2026-08-20T09:05:00.000Z",
    });
    expect(jobs[0]?.data_types).toEqual(expect.arrayContaining(["exercise", "distance", "sedentary-period", "run-vo2-max"]));
    expect(jobs[0]?.data_types).not.toEqual(expect.arrayContaining(["heart-rate", "heart-rate-variability", "activity-level"]));
  });

  it("does not insert a second repair when another cron already owns the lock", async () => {
    testState.claimCloudflareLock.mockResolvedValue(false);

    const response = await GET(new Request("https://soma.example/api/cron/sync", { headers: { authorization: "Bearer cron-secret" } }));

    expect(response.status).toBe(200);
    expect(testState.inserts.filter((insert) => insert.table === "sync_jobs")).toHaveLength(0);
  });

  it("queues the current automatic window while a full-history import is open", async () => {
    testState.connectionMetadata = { analytics_backfill_version: 1 };
    testState.openJobs = [{ connection_id: "connection-1", sync_trigger: "initial", import_range: "all_history" }];

    const response = await GET(new Request("https://soma.example/api/cron/sync", { headers: { authorization: "Bearer cron-secret" } }));

    expect(response.status).toBe(200);
    const jobs = testState.inserts.filter((insert) => insert.table === "sync_jobs").map((insert) => insert.values as Record<string, unknown>);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      connection_id: "connection-1",
      import_range: "90_days",
      sync_trigger: "automatic",
      scheduled_civil_date: "2026-08-20",
      scheduled_sync_slot: "2026-08-20T09:00:00.000Z",
    });
  });
});
