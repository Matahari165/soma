import { describe, expect, it, vi } from "vitest";
import { summarizeAssistantData, type AssistantDataSummaryJob } from "./data-summary-job";
import type { AssistantSemanticResult } from "./semantic-query";

const storageMocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("@/lib/cloudflare/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/cloudflare/db")>(),
  createCloudflareAdminClient: storageMocks.client,
}));

const query = { dataset: "daily_health", period: { from: "2020-01-01", to: "2020-01-06" }, metrics: ["hrv_ms"] };
function store() {
  const jobs = new Map<string, AssistantDataSummaryJob>();
  return {
    jobs,
    findPending: vi.fn(async (userId: string, hash: string) => [...jobs.values()].find((job) => job.user_id === userId && job.query_hash === hash && job.status === "running") ?? null),
    load: vi.fn(async (userId: string, id: string) => {
      const job = jobs.get(id); return job?.user_id === userId ? structuredClone(job) : null;
    }),
    save: vi.fn(async (job: AssistantDataSummaryJob, version?: string) => {
      if (version && jobs.get(job.id)?.updated_at !== version) return false;
      jobs.set(job.id, structuredClone(job)); return true;
    }),
  };
}
function page(index: number): AssistantSemanticResult {
  const date = `2020-01-0${index + 1}`;
  return {
    items: [{ type: "daily", date, observations: [{ metric: "hrv_ms", value: index === 1 ? null : index * 10,
      unit: "ms", availability: index === 1 ? "missing" : "observed", coverage: index === 1 ? 0 : 1,
      measuredAt: null, importedAt: null, freshness: index === 1 ? "missing" : "current",
      provenance: { source: "health_source", provider: "test-provider", algorithmVersion: null } }] }],
    manifest: { dataset: "daily_health", requestedPeriod: query.period, coveredPeriod: { from: date, to: date }, timezone: "UTC",
      totalItems: 6, totalKnown: true, returnedItems: 1, hasMore: index < 5, nextCursor: index < 5 ? String(index + 1) : null, complete: index === 5, generatedAt: "2020-01-01T00:00:00Z" },
  };
}

describe("server summary checkpoints", () => {
  it("resumes an interrupted history without losing or counting a page twice", async () => {
    const repository = store();
    const queryPage = vi.fn(async (_userId, input) => page(Number(input.pagination.cursor ?? 0)));
    const first = await summarizeAssistantData("test-user", { query }, { store: repository, queryPage, maxPages: 2 });
    expect(first.manifest.complete).toBe(false);
    expect(first.manifest.processedItems).toBe(2);
    const second = await summarizeAssistantData("test-user", { query, jobId: first.jobId }, { store: repository, queryPage });
    expect(second.manifest).toMatchObject({ complete: true, processedItems: 6, totalItems: 6 });
    expect(second.statistics.hrv_ms).toMatchObject({ observations: 5, missing: 1, min: 0, max: 50, mean: 28 });
    expect(queryPage).toHaveBeenCalledTimes(6);
    await summarizeAssistantData("test-user", { query, jobId: first.jobId }, { store: repository, queryPage });
    expect(queryPage).toHaveBeenCalledTimes(6);
  });

  it("rejects reuse across users or changed queries before reading any data", async () => {
    const repository = store();
    const queryPage = vi.fn(async () => page(0));
    const first = await summarizeAssistantData("test-user", { query }, { store: repository, queryPage, maxPages: 1 });
    await expect(summarizeAssistantData("other-user", { query, jobId: first.jobId }, { store: repository, queryPage })).rejects.toThrow(/does not belong/);
    await expect(summarizeAssistantData("test-user", { query: { ...query, metrics: ["steps"] }, jobId: first.jobId }, { store: repository, queryPage })).rejects.toThrow(/does not belong/);
    expect(queryPage).toHaveBeenCalledTimes(1);
  });

  it("rejects a nonadvancing cursor rather than duplicating observations", async () => {
    const repository = store();
    const queryPage = vi.fn(async () => ({ ...page(0), manifest: { ...page(0).manifest, nextCursor: null } }));
    await expect(summarizeAssistantData("test-user", { query }, { store: repository, queryPage })).rejects.toThrow(/no progress/);
    expect([...repository.jobs.values()][0].processed).toBe(0);
  });
});

it("aggregates canonical zones only for the activities in the query and preserves gaps", async () => {
  const repository = store();
  const query = { dataset: "activities", period: { from: "2020-01-01", to: "2020-01-31" }, activityTypes: ["BOXING"] };
  const queryPage = vi.fn(async () => ({ items: [{ type: "activity", date: "2020-01-01", activity: { id: "test-boxing", type: "BOXING", durationMinutes: 1 } }],
    manifest: { ...page(5).manifest, dataset: "activities", requestedPeriod: query.period, totalItems: 1, returnedItems: 1 } }));
  const telemetry = vi.fn(async () => ({ calculatedZones: { maximumHeartRate: { source: "personal", bpm: 200 }, complete: true,
    seconds: { z1: 0, z2: 20, z3: 0, z4: 0, z5: 0 }, belowZoneSeconds: 0, aboveMaximumSeconds: 0 },
    coverage: { observedSeconds: 20, activeSeconds: 60, percent: 100 / 3 }, heartRateFetchLimited: false }));
  const result = await summarizeAssistantData("test-user", { query, includeHeartRateZones: true }, {
    store: repository, queryPage: queryPage as unknown as NonNullable<Parameters<typeof summarizeAssistantData>[2]>["queryPage"],
    telemetry: telemetry as unknown as NonNullable<Parameters<typeof summarizeAssistantData>[2]>["telemetry"],
  });
  expect(telemetry).toHaveBeenCalledWith("test-user", { activityId: "test-boxing" }, undefined, expect.objectContaining({ signal: expect.any(AbortSignal), skipHeartRateFetch: false }));
  expect(result.heartRateZones).toMatchObject({ sessions: 1, partial: 1, seconds: { z2: 20 }, references: { "personal:200": 1 } });
  expect(result.manifest.complete).toBe(true);
});

it("keeps the last successful checkpoint when a source page fails", async () => {
  const repository = store();
  const queryPage = vi.fn().mockResolvedValueOnce(page(0)).mockRejectedValueOnce(new Error("synthetic outage"));
  await expect(summarizeAssistantData("test-user", { query }, { store: repository, queryPage })).rejects.toThrow("synthetic outage");
  const saved = [...repository.jobs.values()][0];
  expect(saved.processed).toBe(1);
  expect(saved.cursor).toBe("1");
  const resumed = await summarizeAssistantData("test-user", { query }, {
    store: repository, queryPage: vi.fn(async (_user, input) => page(Number(input.pagination.cursor ?? 0))),
  });
  expect(resumed.manifest.processedItems).toBe(6);
  expect(resumed.statistics.hrv_ms.mean).toBe(28);
});

it("reports a checkpoint conflict without double-counting a concurrent page", async () => {
  const repository = store();
  const first = await summarizeAssistantData("test-user", { query }, { store: repository, queryPage: vi.fn(async () => page(0)), maxPages: 1 });
  const queryPage = vi.fn(async () => page(1));
  const save = vi.fn(async () => false);
  const result = await summarizeAssistantData("test-user", { query, jobId: first.jobId }, { store: { ...repository, save }, queryPage });
  expect(result.manifest.processedItems).toBe(1);
  expect(repository.jobs.get(first.jobId)?.processed).toBe(1);
});


it("uses the actual storage timestamp when resuming the next checkpoint", async () => {
  let saved: AssistantDataSummaryJob | null = null;
  storageMocks.client.mockImplementation(() => ({ from: () => {
    let values: AssistantDataSummaryJob | null = null;
    let expectedVersion: string | null = null;
    const builder = {
      eq: (field: string, value: unknown) => { if (field === "updated_at") expectedVersion = String(value); return builder; },
      order: () => builder, limit: () => builder,
      maybeSingle: async () => ({ data: saved, error: null }),
      insert: async (job: AssistantDataSummaryJob) => { saved = structuredClone(job); return { error: null }; },
      update: (job: AssistantDataSummaryJob) => { values = structuredClone(job); return builder; },
      select: () => {
        if (!values) return builder;
        if (saved?.updated_at !== expectedVersion) return Promise.resolve({ data: [], error: null });
        saved = { ...values, updated_at: new Date(Date.parse(values.updated_at) + 100).toISOString() };
        return Promise.resolve({ data: [{ id: saved.id, updated_at: saved.updated_at }], error: null });
      },
    };
    return builder;
  } }));
  const result = await summarizeAssistantData("test-user", { query }, {
    queryPage: vi.fn(async (_user, input) => page(Number(input.pagination.cursor ?? 0))),
  });
  expect(result.manifest).toMatchObject({ complete: true, processedItems: 6 });
});


it("returns the durable checkpoint when a source page exceeds the global budget", async () => {
  const repository = store();
  const queryPage = vi.fn(() => new Promise<never>(() => {}));
  const result = await summarizeAssistantData("test-user", { query }, { store: repository, queryPage, budgetMs: 25 });
  expect(result).toMatchObject({ status: "running", pauseReason: "time_budget", manifest: { complete: false, processedItems: 0 } });
  expect(repository.jobs.get(result.jobId)?.processed).toBe(0);
});

it("resumes unfinished Google pages without recounting the activity or its zones", async () => {
  const repository = store();
  const activityQuery = { dataset: "activities", period: query.period, activityTypes: ["BOXING"] };
  const queryPage = vi.fn(async () => ({ items: [{ type: "activity", date: "2020-01-01", activity: { id: "test-boxing", type: "BOXING", durationMinutes: 1 } }],
    manifest: { ...page(5).manifest, dataset: "activities", requestedPeriod: query.period, totalItems: 1, returnedItems: 1 } }));
  const telemetry = vi.fn(async (_user, _input, _deps, options) => {
    if (options.heartRatePageToken !== "page-two") {
      await options.onHeartRatePage("page-two");
      return new Promise<never>(() => {});
    }
    await options.onHeartRatePage(null);
    return { calculatedZones: { maximumHeartRate: { source: "personal", bpm: 200 }, complete: true,
      seconds: { z1: 0, z2: 60, z3: 0, z4: 0, z5: 0 }, belowZoneSeconds: 0, aboveMaximumSeconds: 0 },
      coverage: { observedSeconds: 60, activeSeconds: 60, percent: 100 }, heartRateFetchLimited: false };
  });
  type Options = NonNullable<Parameters<typeof summarizeAssistantData>[2]>;
  const first = await summarizeAssistantData("test-user", { query: activityQuery, includeHeartRateZones: true }, {
    store: repository, queryPage: queryPage as unknown as Options["queryPage"], telemetry: telemetry as unknown as Options["telemetry"], budgetMs: 30,
  });
  expect(first).toMatchObject({ status: "running", pauseReason: "time_budget", manifest: { processedItems: 0 } });
  expect(repository.jobs.get(first.jobId)?.telemetry_progress).toMatchObject({ nextPageToken: "page-two", complete: false });
  const second = await summarizeAssistantData("test-user", { query: activityQuery, includeHeartRateZones: true, jobId: first.jobId }, {
    store: repository, queryPage: queryPage as unknown as Options["queryPage"], telemetry: telemetry as unknown as Options["telemetry"],
  });
  expect(second).toMatchObject({ status: "completed", manifest: { processedItems: 1 }, heartRateZones: { sessions: 1, seconds: { z2: 60 } } });
  expect(repository.jobs.get(first.jobId)?.telemetry_progress).toBeNull();
});

it("does not claim completion when the final checkpoint write outlasts the budget", async () => {
  const repository = store();
  const save = vi.fn(async (job: AssistantDataSummaryJob, version?: string) => version ? new Promise<boolean>(() => {}) : repository.save(job));
  const result = await summarizeAssistantData("test-user", { query }, {
    store: { ...repository, save }, queryPage: vi.fn(async () => page(5)), budgetMs: 25,
  });
  expect(result).toMatchObject({ status: "running", pauseReason: "time_budget", manifest: { processedItems: 0, complete: false } });
});


it("bounds the pending-job lookup within the same global deadline", async () => {
  const repository = store();
  const findPending = vi.fn(() => new Promise<never>(() => {}));
  await expect(summarizeAssistantData("test-user", { query }, {
    store: { ...repository, findPending }, budgetMs: 25,
  })).rejects.toMatchObject({ name: "TimeoutError" });
  expect(repository.save).not.toHaveBeenCalled();
});

it("retries a provider failure on the first page instead of completing with unavailable zones", async () => {
  const repository = store();
  type Options = NonNullable<Parameters<typeof summarizeAssistantData>[2]>;
  const activityQuery = { dataset: "activities", period: query.period, activityTypes: ["BOXING"] };
  const queryPage = vi.fn(async () => ({ items: [{ type: "activity", date: "2020-01-01", activity: { id: "test-boxing", type: "BOXING", durationMinutes: 1 } }],
    manifest: { ...page(5).manifest, dataset: "activities", requestedPeriod: query.period, totalItems: 1, returnedItems: 1 } }));
  const telemetry = vi.fn().mockRejectedValueOnce(new Error("synthetic provider outage"))
    .mockResolvedValueOnce({ calculatedZones: null, coverage: { observedSeconds: 0, activeSeconds: 60, percent: 0 }, heartRateFetchLimited: false });
  const first = await summarizeAssistantData("test-user", { query: activityQuery, includeHeartRateZones: true }, {
    store: repository, queryPage: queryPage as unknown as Options["queryPage"], telemetry,
  });
  expect(first).toMatchObject({ status: "running", pauseReason: "source_unavailable", manifest: { processedItems: 0 }, heartRateZones: { unavailable: 0 } });
  const second = await summarizeAssistantData("test-user", { query: activityQuery, includeHeartRateZones: true, jobId: first.jobId }, {
    store: repository, queryPage: queryPage as unknown as Options["queryPage"], telemetry,
  });
  expect(second).toMatchObject({ status: "completed", manifest: { processedItems: 1 }, heartRateZones: { unavailable: 1 } });
});

it("preserves an unfinished continuation when the provider connection becomes unavailable", async () => {
  const repository = store();
  type Options = NonNullable<Parameters<typeof summarizeAssistantData>[2]>;
  const activityQuery = { dataset: "activities", period: query.period, activityTypes: ["BOXING"] };
  const queryPage = vi.fn(async () => ({ items: [{ type: "activity", date: "2020-01-01", activity: { id: "test-boxing", type: "BOXING", durationMinutes: 1 } }],
    manifest: { ...page(5).manifest, dataset: "activities", requestedPeriod: query.period, totalItems: 1, returnedItems: 1 } }));
  const telemetry = vi.fn(async (_user, _input, _deps, options) => {
    await options.onHeartRatePage("page-two");
    throw new Error("synthetic provider outage");
  });
  const first = await summarizeAssistantData("test-user", { query: activityQuery, includeHeartRateZones: true }, {
    store: repository, queryPage: queryPage as unknown as Options["queryPage"], telemetry,
  });
  const result = await summarizeAssistantData("test-user", { query: activityQuery, includeHeartRateZones: true, jobId: first.jobId }, {
    store: repository, queryPage: queryPage as unknown as Options["queryPage"],
    telemetry: vi.fn(async () => ({ calculatedZones: null, coverage: { observedSeconds: 10, activeSeconds: 60, percent: 100 / 6 }, heartRateFetchLimited: false })) as unknown as Options["telemetry"],
  });
  expect(result).toMatchObject({ status: "running", pauseReason: "source_unavailable", manifest: { processedItems: 0 } });
  expect(repository.jobs.get(first.jobId)?.telemetry_progress?.nextPageToken).toBe("page-two");
});


describe("summary integration with detailed source records", () => {
  it("summarizes sleep observations and excludes skipped meals from nutritional statistics", async () => {
    const observation = { metric: "sleep_minutes", value: 420, unit: "min", availability: "observed", coverage: 1,
      measuredAt: null, importedAt: null, freshness: "current", provenance: { source: "health_source", provider: "synthetic", algorithmVersion: null } };
    const baseManifest = { requestedPeriod: query.period, coveredPeriod: query.period, timezone: "UTC", totalItems: 1,
      totalKnown: true, returnedItems: 1, hasMore: false, nextCursor: null, complete: true, generatedAt: "2020-01-07T00:00:00.000Z" };
    const sleep = await summarizeAssistantData("synthetic-user", { query: { dataset: "sleep_sessions", period: query.period } }, {
      store: store(), queryPage: async () => ({ items: [{ type: "sleep_session", date: "2020-01-01", session: {}, observations: [observation] }],
        manifest: { ...baseManifest, dataset: "sleep_sessions" } } as AssistantSemanticResult),
    });
    expect(sleep.statistics.sleep_minutes).toMatchObject({ observations: 1, mean: 420, sources: ["health_source"] });
    const meals = await summarizeAssistantData("synthetic-user", { query: { dataset: "meals", period: query.period } }, {
      store: store(), queryPage: async () => ({ items: [
        { type: "meal", date: "2020-01-01", meal: { nutritionEligible: false }, observations: [{ ...observation, metric: "calories_kcal", value: 900 }] },
        { type: "meal", date: "2020-01-02", meal: { nutritionEligible: true }, observations: [{ ...observation, metric: "calories_kcal", value: 450, unit: "kcal", provenance: { source: "confirmed_meals", provider: null, algorithmVersion: null } }] },
      ], manifest: { ...baseManifest, dataset: "meals", returnedItems: 2, totalItems: 2 } } as AssistantSemanticResult),
    });
    expect(meals.manifest.processedItems).toBe(2);
    expect(meals.statistics.calories_kcal).toMatchObject({ observations: 1, sum: 450, sources: ["confirmed_meals"] });
  });
});
