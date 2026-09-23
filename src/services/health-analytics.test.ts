import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = { data: unknown; error: unknown | null };
type QueryCall = {
  table: string;
  filters: Array<{ method: string; column?: string; value?: unknown }>;
  limits: number[];
  range?: [number, number];
};

const testState = vi.hoisted(() => ({
  from: vi.fn(),
  queries: [] as QueryCall[],
  metrics: [] as Array<Record<string, unknown>>,
  scores: [] as Array<Record<string, unknown>>,
  sleeps: [] as Array<Record<string, unknown>>,
  exercises: [] as Array<Record<string, unknown>>,
  heartRates: [] as Array<Record<string, unknown>>,
  errorTables: new Set<string>(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => Promise.resolve({ id: "user-1" }),
}));
vi.mock("@/lib/env", () => ({ isLocalPreviewMode: () => false }));
vi.mock("@/lib/cloudflare/server", () => ({
  createCloudflareServerClient: () => Promise.resolve({ from: testState.from }),
}));
vi.mock("@/lib/cloudflare/db", () => ({
  createCloudflareAdminClient: () => ({ from: testState.from }),
}));
vi.mock("./nutrition-targets", () => ({
  loadNutritionTargetsStateForUser: () => Promise.resolve(null),
}));

import { exerciseSummaryFromRecord, getActivityAnalytics, getRecoveryAnalytics, getSleepAnalytics, heartRateWindowForCivilDate } from "./health-analytics";

function resultFor(query: QueryCall): QueryResult {
  if (testState.errorTables.has(query.table)) return { data: null, error: { message: "temporary failure" } };
  if (query.table === "profiles") return { data: { timezone: "Europe/Paris" }, error: null };
  if (query.table === "provider_connections") return { data: { last_synced_at: null }, error: null };
  if (query.table === "sleep_preferences") return { data: { base_target_minutes: 510, usual_wake_time: "07:00", wind_down_minutes: 30 }, error: null };
  if (query.table === "daily_health_metrics") return { data: testState.metrics, error: null };
  if (query.table === "daily_scores") return { data: testState.scores, error: null };
  if (query.table !== "health_records") return { data: [], error: null };

  const dataType = query.filters.find((filter) => filter.method === "eq" && filter.column === "data_type")?.value;
  if (dataType === "sleep") return { data: testState.sleeps, error: null };
  if (dataType === "exercise") return { data: query.range ? testState.exercises.slice(query.range[0], query.range[1] + 1) : testState.exercises, error: null };
  if (dataType === "heart-rate") return { data: testState.heartRates, error: null };
  return { data: [], error: null };
}

function createQuery(table: string) {
  const query: QueryCall & Record<string, unknown> = { table, filters: [], limits: [] };
  const chain = (method: string, column?: string, value?: unknown) => {
    if (method === "limit") query.limits.push(Number(column));
    else query.filters.push({ method, column, value });
    return chain;
  };
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn((column: string, value: unknown) => chain("eq", column, value));
  chain.gte = vi.fn((column: string, value: unknown) => chain("gte", column, value));
  chain.lt = vi.fn((column: string, value: unknown) => chain("lt", column, value));
  chain.order = vi.fn((column: string, options: unknown) => {
    void column;
    void options;
    return chain;
  });
  chain.limit = vi.fn((value: number) => chain("limit", String(value)));
  chain.range = vi.fn((from: number, to: number) => { query.range = [from, to]; return chain; });
  chain.maybeSingle = vi.fn(() => Promise.resolve(resultFor(query)));
  chain.then = ((resolve: Parameters<Promise<QueryResult>["then"]>[0], reject: Parameters<Promise<QueryResult>["then"]>[1]) => Promise.resolve(resultFor(query)).then(resolve, reject)) as unknown;
  testState.queries.push(query);
  return chain;
}

function configureQueries() {
  testState.from.mockImplementation((table: string) => createQuery(table));
}

function queriesFor(table: string) {
  return testState.queries.filter((query) => query.table === table);
}

describe("health analytics first-screen loading", () => {
  beforeEach(() => {
    testState.queries.length = 0;
    testState.metrics = [
      {
        metric_date: "2026-09-10",
        sleep_minutes: 0,
        sleep_need_minutes: null,
        sleep_efficiency: null,
        sleep_regularity: null,
        hrv_ms: 0,
        resting_heart_rate: null,
        respiratory_rate: null,
        source_freshness: {},
      },
      {
        metric_date: "2026-09-09",
        sleep_minutes: 480,
        sleep_need_minutes: 510,
        sleep_efficiency: 92,
        sleep_regularity: 84,
        hrv_ms: 52,
        resting_heart_rate: 58,
        respiratory_rate: 14,
        source_freshness: {},
      },
    ];
    testState.scores = [{ score_date: "2026-09-10", kind: "recovery", score: 70, drivers: {}, algorithm_version: "recovery-v1" }];
    testState.sleeps = [];
    testState.exercises = [];
    testState.heartRates = [
      { measured_at: "2026-09-10T08:00:00.000Z", payload: { beatsPerMinute: 0 } },
      { measured_at: "2026-09-09T21:59:59.000Z", payload: { beatsPerMinute: 75 } },
    ];
    testState.errorTables.clear();
    configureQueries();
  });

  it("keeps the first-screen 30-day history and exact local-day heart-rate bounds", async () => {
    const analytics = await getRecoveryAnalytics();

    expect(queriesFor("daily_health_metrics")[0]?.limits).toEqual([30]);
    expect(queriesFor("daily_scores")[0]?.limits).toEqual([30]);

    const heartRateQuery = queriesFor("health_records").find((query) => query.filters.some((filter) => filter.column === "data_type" && filter.value === "heart-rate"));
    expect(heartRateQuery?.filters).toEqual(expect.arrayContaining([
      { method: "gte", column: "measured_at", value: "2026-09-09T22:00:00.000Z" },
      { method: "lt", column: "measured_at", value: "2026-09-10T22:00:00.000Z" },
    ]));
    expect(analytics.heartRateSamples).toEqual([{ measuredAt: "2026-09-10T08:00:00.000Z", bpm: 0 }]);
    expect(analytics.days.at(-1)?.sleep_minutes).toBe(0);
    expect(analytics.days.at(-1)?.sleep_need_minutes).toBeNull();
  });

  it("resolves DST-aware local-day bounds without widening the heart-rate query", () => {
    expect(heartRateWindowForCivilDate("2026-03-29", "Europe/Paris")).toEqual({
      start: "2026-03-28T23:00:00.000Z",
      end: "2026-03-29T22:00:00.000Z",
    });
  });

  it("preserves Apple provenance and sync time when no provider connection row exists", async () => {
    testState.metrics = [{
      metric_date: "2026-09-10",
      sleep_minutes: 480,
      hrv_ms: 52,
      source_freshness: {},
      data_quality: { source: "apple_health", primaryWearable: "Apple Watch", importedAt: "2026-09-10T08:00:00.000Z" },
    }];

    const analytics = await getRecoveryAnalytics();

    expect(analytics.days[0]?.data_quality).toMatchObject({ source: "apple_health", primaryWearable: "Apple Watch" });
    expect(analytics.importedAt).toBe("2026-09-10T08:00:00.000Z");
  });

  it("returns no civil heart-rate window for an invalid date", () => {
    expect(heartRateWindowForCivilDate("not-a-date", "Europe/Paris")).toBeNull();
  });

  it("keeps daily metrics bounded but loads the complete exercise history", async () => {
    testState.exercises = Array.from({ length: 501 }, (_, index) => ({ source_record_id: `exercise-${index}`, civil_date: "2026-09-10", start_time: null, end_time: null, payload: { exercise: { exerciseType: "RUNNING" } } }));
    const analytics = await getActivityAnalytics();

    expect(queriesFor("daily_health_metrics")[0]?.limits).toEqual([30]);
    expect(queriesFor("daily_scores")[0]?.limits).toEqual([30]);
    const exerciseQuery = queriesFor("health_records").find((query) => query.filters.some((filter) => filter.column === "data_type" && filter.value === "exercise"));
    expect(exerciseQuery?.limits).toEqual([20]);
    expect(analytics.exercises).toHaveLength(501);
    expect(queriesFor("health_records").filter((query) => query.range).map((query) => query.range)).toEqual([[0, 499], [500, 999]]);
    expect(queriesFor("health_records").some((query) => query.filters.some((filter) => filter.value === "heart-rate"))).toBe(false);
  });

  it("preserves measured maximum heart rate and leaves it unavailable when absent", () => {
    const fromWhoop = exerciseSummaryFromRecord({
      source_record_id: "whoop-1",
      civil_date: "2026-09-10",
      start_time: null,
      end_time: null,
      payload: { exercise: { exerciseType: "RUNNING", maximumHeartRate: 184, metricsSummary: { averageHeartRateBeatsPerMinute: 151 } } },
    });
    const absent = exerciseSummaryFromRecord({ source_record_id: "run-2", civil_date: "2026-09-10", start_time: null, end_time: null, payload: { exercise: { exerciseType: "RUNNING" } } });

    expect(fromWhoop.maximumHeartRate).toBe(184);
    expect(absent.maximumHeartRate).toBeNull();
  });

  it("keeps sleep's latest detail read and 30-day recommendation inputs intact", async () => {
    await getSleepAnalytics();

    expect(queriesFor("daily_health_metrics")[0]?.limits).toEqual([30]);
    expect(queriesFor("daily_scores")[0]?.limits).toEqual([30]);
    const sleepQuery = queriesFor("health_records").find((query) => query.filters.some((filter) => filter.column === "data_type" && filter.value === "sleep"));
    expect(sleepQuery?.limits).toEqual([1]);
    expect(queriesFor("health_records").some((query) => query.filters.some((filter) => filter.value === "heart-rate"))).toBe(false);
  });

  it("keeps the main sleep page available when an optional detail read fails", async () => {
    testState.errorTables.add("health_records");

    const analytics = await getSleepAnalytics();

    expect(analytics.days).toHaveLength(2);
    expect(analytics.latestSleepStages).toEqual([]);
    expect(analytics.heartRateSamples).toEqual([]);
  });

  it("keeps metrics available when freshness metadata fails", async () => {
    testState.errorTables.add("provider_connections");

    const analytics = await getRecoveryAnalytics();

    expect(analytics.days).toHaveLength(2);
    expect(analytics.importedAt).toBeNull();
  });

  it("fails critical metrics reads instead of presenting invented data", async () => {
    testState.errorTables.add("daily_health_metrics");

    await expect(getRecoveryAnalytics()).rejects.toThrow("Health analytics are temporarily unavailable.");
  });
});
