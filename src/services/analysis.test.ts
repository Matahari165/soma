import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { aggregateHealthRecords, type NormalizedHealthRecord } from "@/domain/health/aggregate";

type GteCall = { table: string; column: string; value: string };
type UpsertCall = { table: string; rows: unknown };
type TestHealthRecord = NormalizedHealthRecord & { id: string };
type AnalysisReadCall = { columns: string; dateColumn: string; lowerBound: string; afterId: string | null; limit: number };

const testState = vi.hoisted(() => ({
  adminFrom: vi.fn(),
  gteCalls: [] as GteCall[],
  upsertCalls: [] as UpsertCall[],
  analysisReadCalls: [] as AnalysisReadCall[],
  analysisRecords: [] as TestHealthRecord[],
  effortOptionsCalls: [] as unknown[],
  nutritionTargetState: { persisted: false, targets: { caloriesKcal: { likely: 700 } } },
}));

vi.mock("@/lib/cloudflare/db", () => ({
  createCloudflareAdminClient: () => ({ from: testState.adminFrom }),
}));
vi.mock("@/domain/briefs/generate", () => ({
  generateEveningBrief: () => "evening",
  generateMorningBrief: () => "morning",
}));
vi.mock("@/domain/correlations/spearman", () => ({
  spearmanCorrelation: () => ({ coefficient: null, sampleSize: 0, quality: "insufficient" }),
}));
vi.mock("@/domain/insights/engine", () => ({ generateHealthInsights: () => [] }));
vi.mock("@/domain/metrics/wellness", () => ({
  acuteChronicLoadRatio: () => null,
  activityRegularity: () => ({ activeDayRate: null, consistencyScore: null }),
  isActiveDay: () => null,
}));
vi.mock("@/domain/scores/effort", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/domain/scores/effort")>(),
  calculateEffortScoreFromAvailable: (_input: unknown, options: unknown) => {
    testState.effortOptionsCalls.push(options);
    return { score: 50, loadScore: 50, status: "steady", coverage: 1, algorithmVersion: "test" };
  },
}));
vi.mock("./nutrition-targets", () => ({
  loadNutritionTargetsStateForUser: () => Promise.resolve(testState.nutritionTargetState),
}));
vi.mock("@/domain/scores/recovery", () => ({
  calculateRecoveryScore: () => ({ score: 50, status: "steady", drivers: {}, algorithmVersion: "test" }),
}));
vi.mock("@/domain/scores/regularity", () => ({ sleepRegularityScore: () => 80 }));
vi.mock("@/domain/scores/sleep-need", () => ({
  estimateSleepNeed: () => ({ estimatedNeedMinutes: 510 }),
  recommendBedtimeFromHistory: () => ({ bedtimeMinutes: 1_380 }),
}));
vi.mock("@/domain/scores/sleep", () => ({
  calculateSleepScore: () => ({ score: 80, durationComponent: 80, efficiencyComponent: 80, regularityComponent: 80, algorithmVersion: "test" }),
}));

import {
  ANALYSIS_DATA_TYPES,
  ANALYSIS_RECORD_PAGE_SIZE,
  analysisWindowFor,
  changedDerivedRows,
  healthRecordCoverageDates,
  loadHealthRecordsForAnalysis,
  minutesSinceMidnightIn,
  recomputeUserHealth,
  rollingAnalysisStart,
} from "./analysis";

type TestQuery = {
  select: (columns?: string) => TestQuery;
  eq: (column: string, value: unknown) => TestQuery;
  gte: (column: string, value: string) => TestQuery;
  gt: (column: string, value: string) => TestQuery;
  single: () => Promise<{ data: unknown; error: null }>;
  upsert: (rows: unknown) => Promise<{ error: null }>;
  delete: () => TestQuery;
  in: (column: string, values: unknown[]) => Promise<{ error: null }>;
  order: (column: string, options?: unknown) => TestQuery;
  limit: (value: number) => TestQuery;
  then: Promise<unknown>["then"];
};

function configureHealthRecordQuery() {
  const query = {} as TestQuery;
  let columns = "*";
  let dateColumn = "";
  let lowerBound = "";
  let afterId: string | null = null;
  let limit = 0;
  query.select = vi.fn((value = "*") => {
    columns = value;
    return query;
  });
  query.eq = vi.fn(() => query);
  query.in = vi.fn(() => query) as unknown as TestQuery["in"];
  query.gte = vi.fn((column, value) => {
    dateColumn = column;
    lowerBound = value;
    return query;
  });
  query.gt = vi.fn((_column, value) => {
    afterId = value;
    return query;
  });
  query.order = vi.fn(() => query);
  query.limit = vi.fn((value) => {
    limit = value;
    return query;
  });
  query.then = ((resolve, reject) => {
    const page = testState.analysisRecords.filter((record) => {
      const value = (record as unknown as Record<string, unknown>)[dateColumn];
      return typeof value === "string" && value >= lowerBound && (!afterId || record.id > afterId);
    }).slice(0, limit);
    testState.analysisReadCalls.push({ columns, dateColumn, lowerBound, afterId, limit });
    return Promise.resolve({ data: page, error: null }).then(resolve, reject);
  }) as TestQuery["then"];
  return query;
}

function configureAdminQueries() {
  testState.adminFrom.mockImplementation((table: string) => {
    if (table === "health_records") return configureHealthRecordQuery();
    const result = table === "profiles"
      ? { data: { timezone: "UTC", display_name: "Test" }, error: null }
      : table === "sleep_preferences"
        ? { data: { usual_wake_time: "07:00", wind_down_minutes: 30 }, error: null }
        : { data: [], error: null };
    const query = {} as TestQuery;
    query.select = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.gte = vi.fn((column, value) => {
      testState.gteCalls.push({ table, column, value });
      return query;
    });
    query.single = vi.fn(() => Promise.resolve(result));
    query.upsert = vi.fn((rows) => {
      testState.upsertCalls.push({ table, rows });
      return Promise.resolve({ error: null });
    });
    query.delete = vi.fn(() => query);
    query.in = vi.fn(() => Promise.resolve({ error: null }));
    query.gt = vi.fn(() => query);
    query.order = vi.fn(() => query);
    query.limit = vi.fn(() => query);
    query.then = ((resolve, reject) => Promise.resolve(result).then(resolve, reject)) as TestQuery["then"];
    return query;
  });
}

const sourceRecords: TestHealthRecord[] = [
  {
    id: "record-exercise",
    data_type: "exercise",
    civil_date: "2026-08-01",
    start_time: "2026-08-01T10:00:00Z",
    end_time: "2026-08-01T10:25:00Z",
    measured_at: null,
    payload: { exercise: { exerciseType: "RUNNING", metricsSummary: { distanceMillimeters: 5_000_000 } } },
  },
  {
    id: "record-steps",
    data_type: "steps",
    civil_date: "2026-08-02",
    start_time: null,
    end_time: null,
    measured_at: "2026-08-02T12:00:00Z",
    payload: { steps: { count: 4_200 } },
  },
  {
    id: "record-old-steps",
    data_type: "steps",
    civil_date: "2026-05-01",
    start_time: null,
    end_time: null,
    measured_at: "2026-05-01T12:00:00Z",
    payload: { steps: { count: 4_200 } },
  },
];

describe("civil-time health analysis", () => {
  it("uses the profile timezone instead of the server timezone", () => {
    expect(minutesSinceMidnightIn("2026-08-20T21:30:00.000Z", "Europe/Paris")).toBe(23 * 60 + 30);
    expect(minutesSinceMidnightIn("2026-08-20T21:30:00.000Z", "America/New_York")).toBe(17 * 60 + 30);
  });

  it("follows daylight-saving transitions", () => {
    expect(minutesSinceMidnightIn("2026-03-29T00:30:00.000Z", "Europe/Paris")).toBe(90);
    expect(minutesSinceMidnightIn("2026-03-29T01:30:00.000Z", "Europe/Paris")).toBe(210);
    expect(minutesSinceMidnightIn("not-a-date", "Europe/Paris")).toBeNull();
  });

  it("does not reload unused high-frequency series for daily materialization", () => {
    expect(ANALYSIS_DATA_TYPES).not.toContain("heart-rate");
    expect(ANALYSIS_DATA_TYPES).not.toContain("heart-rate-variability");
    expect(ANALYSIS_DATA_TYPES).toContain("daily-heart-rate-variability");
    expect(ANALYSIS_DATA_TYPES).toContain("daily-resting-heart-rate");
    expect(ANALYSIS_DATA_TYPES).toContain("daily-exercise-summary");
  });

  it("keeps enough recent history for 30-day baselines without rebuilding all wearable history", () => {
    expect(rollingAnalysisStart(new Date("2026-08-25T12:00:00.000Z"))).toBe("2026-07-11");
  });

  it("uses the 45-day window by default and supports a 90-day historical window", () => {
    const now = new Date("2026-08-27T12:00:00.000Z");

    expect(analysisWindowFor(now)).toEqual({ days: 45, start: "2026-07-13" });
    expect(analysisWindowFor(now, { windowDays: 90 })).toEqual({ days: 90, start: "2026-05-29" });
  });

  it("keeps running metrics null on a covered day without a run", () => {
    const record = (overrides: Partial<NormalizedHealthRecord>): NormalizedHealthRecord => ({
      data_type: "steps",
      civil_date: "2026-08-07",
      start_time: null,
      end_time: null,
      measured_at: "2026-08-07T12:00:00Z",
      payload: {},
      ...overrides,
    });
    const days = aggregateHealthRecords([
      record({ data_type: "exercise", payload: { exercise: { exerciseType: "RUNNING", metricsSummary: { distanceMillimeters: 5_000_000 } } } }),
      record({ civil_date: "2026-08-08", payload: { steps: { count: 4200 } } }),
    ]);

    expect(days[0]?.running_distance_km).toBe(5);
    expect(days[1]?.running_distance_km).toBeNull();
    expect(days[1]?.running_pace_seconds_per_km).toBeNull();
    expect(days[1]?.running_average_heart_rate).toBeNull();
  });

  it("preserves derived days covered by an older wearable source", () => {
    expect(healthRecordCoverageDates([{
      civil_date: "2026-07-20",
      start_time: "2026-07-19T22:00:00.000Z",
      end_time: "2026-07-20T06:00:00.000Z",
      measured_at: null,
    }])).toEqual(new Set(["2026-07-20", "2026-07-18", "2026-07-19", "2026-07-21"]));
  });

  it("does not rewrite identical derived days just because storage timestamps differ", () => {
    const existing = [{ id: "row-1", user_id: "user-1", metric_date: "2026-08-25", sleep_minutes: 480, updated_at: "old" }];
    const incoming = [{ user_id: "user-1", metric_date: "2026-08-25", sleep_minutes: 480, updated_at: "new" }];
    expect(changedDerivedRows(existing, incoming, (row) => String(row.metric_date))).toEqual([]);
  });

  it("rewrites a derived day when a statistical value changes", () => {
    const existing = [{ user_id: "user-1", metric_date: "2026-08-25", sleep_minutes: 480 }];
    const incoming = [{ user_id: "user-1", metric_date: "2026-08-25", sleep_minutes: 481 }];
    expect(changedDerivedRows(existing, incoming, (row) => String(row.metric_date))).toEqual(incoming);
  });
});

describe("recomputeUserHealth analysis windows", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T12:00:00.000Z"));
    testState.gteCalls.length = 0;
    testState.upsertCalls.length = 0;
    testState.analysisReadCalls.length = 0;
    testState.analysisRecords = sourceRecords;
    testState.effortOptionsCalls.length = 0;
    testState.nutritionTargetState = { persisted: false, targets: { caloriesKcal: { likely: 700 } } };
    configureAdminQueries();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("uses the selected analysis start for each bounded source read and derived read", async () => {
    await recomputeUserHealth("user-1");
    expect(testState.analysisReadCalls.map((call) => [call.dateColumn, call.lowerBound])).toEqual([
      ["civil_date", "2026-07-13"],
      ["end_time", "2026-07-13T00:00:00.000Z"],
      ["start_time", "2026-07-13T00:00:00.000Z"],
      ["measured_at", "2026-07-13T00:00:00.000Z"],
    ]);
    expect(testState.analysisReadCalls.every((call) => call.limit === ANALYSIS_RECORD_PAGE_SIZE && call.afterId === null)).toBe(true);
    expect(testState.gteCalls.filter((call) => call.table === "daily_health_metrics" || call.table === "daily_scores").every((call) => call.value === "2026-07-13")).toBe(true);

    testState.gteCalls.length = 0;
    testState.upsertCalls.length = 0;
    testState.analysisReadCalls.length = 0;
    await recomputeUserHealth("user-1", { windowDays: 90 });
    expect(testState.analysisReadCalls.map((call) => call.lowerBound)).toEqual([
      "2026-05-29",
      "2026-05-29T00:00:00.000Z",
      "2026-05-29T00:00:00.000Z",
      "2026-05-29T00:00:00.000Z",
    ]);
    expect(testState.gteCalls.filter((call) => call.table === "daily_health_metrics" || call.table === "daily_scores").every((call) => call.value === "2026-05-29")).toBe(true);
  });

  it("uses a bounded projection, paginates large reads, and deduplicates overlapping date matches", async () => {
    const records = Array.from({ length: ANALYSIS_RECORD_PAGE_SIZE + 1 }, (_, index): TestHealthRecord => ({
      id: `record-${String(index).padStart(4, "0")}`,
      data_type: "steps",
      civil_date: "2026-07-20",
      start_time: null,
      end_time: null,
      measured_at: "2026-07-20T12:00:00Z",
      payload: { steps: { count: index } },
    }));
    testState.analysisRecords = records;

    const loaded = await loadHealthRecordsForAnalysis("user-1", "2026-07-13");

    expect(loaded).toHaveLength(records.length);
    expect(testState.analysisReadCalls.filter((call) => call.dateColumn === "civil_date").map((call) => [call.afterId, call.limit])).toEqual([
      [null, ANALYSIS_RECORD_PAGE_SIZE],
      [`record-${String(ANALYSIS_RECORD_PAGE_SIZE - 1).padStart(4, "0")}`, ANALYSIS_RECORD_PAGE_SIZE],
    ]);
    expect(testState.analysisReadCalls.every((call) => call.columns === "id,provider,data_type,civil_date,start_time,end_time,measured_at,source_device,recording_method,payload")).toBe(true);
  });

  it("keeps measured zero distinct from an unavailable metric after the bounded read", async () => {
    testState.analysisRecords = [{
      id: "record-zero-energy",
      data_type: "active-energy-burned",
      civil_date: "2026-08-03",
      start_time: null,
      end_time: null,
      measured_at: "2026-08-03T12:00:00Z",
      payload: { kilocalories: 0 },
    }];

    await recomputeUserHealth("user-1", { windowDays: 90 });

    const metricRows = (testState.upsertCalls.find((call) => call.table === "daily_health_metrics")?.rows ?? []) as Array<Record<string, unknown>>;
    const day = metricRows.find((row) => row.metric_date === "2026-08-03");
    expect(day?.active_energy_kcal).toBe(0);
    expect(day?.steps).toBeNull();
    expect(day?.sleep_minutes).toBeNull();
  });

  it("persists null running metrics on a covered day without a run", async () => {
    await recomputeUserHealth("user-1", { windowDays: 90 });
    const metricRows = (testState.upsertCalls.find((call) => call.table === "daily_health_metrics")?.rows ?? []) as Array<Record<string, unknown>>;
    const noRunDay = metricRows.find((row) => row.metric_date === "2026-08-02");

    expect(noRunDay).toBeDefined();
    expect(noRunDay?.running_distance_km).toBeNull();
    expect(noRunDay?.running_pace_seconds_per_km).toBeNull();
    expect(noRunDay?.running_average_heart_rate).toBeNull();
    expect(noRunDay?.cumulative_sleep_debt_minutes).toBeNull();
  });

  it("uses intraday steps for active hours without adding them twice to the daily total", async () => {
    testState.analysisRecords = [...sourceRecords, {
      id: "record-intraday-steps", data_type: "steps", civil_date: "2026-08-02",
      start_time: "2026-08-02T10:00:00Z", end_time: "2026-08-02T10:01:00Z", measured_at: "2026-08-02T10:01:00Z",
      payload: { soma: { provenance: "google_health_active_hours_intraday" }, steps: { interval: { startTime: "2026-08-02T10:00:00Z", endTime: "2026-08-02T10:01:00Z" }, count: 100 } },
    }];
    await recomputeUserHealth("user-1");
    const metrics = (testState.upsertCalls.find((call) => call.table === "daily_health_metrics")?.rows ?? []) as Array<Record<string, unknown>>;
    expect(metrics.find((row) => row.metric_date === "2026-08-02")?.steps).toBe(4_200);
    const scores = (testState.upsertCalls.find((call) => call.table === "daily_scores")?.rows ?? []) as Array<Record<string, unknown>>;
    const effort = scores.find((row) => row.score_date === "2026-08-02" && row.kind === "effort");
    expect(effort).toMatchObject({ algorithm_version: "effort-v5", score: null, drivers: { activeHours: { activeHours: 1 } } });
  });

  it("passes the configured nutrition calorie target to every effort score", async () => {
    testState.nutritionTargetState = { persisted: true, targets: { caloriesKcal: { likely: 1_000 } } };

    await recomputeUserHealth("user-1");

    expect(testState.effortOptionsCalls.length).toBeGreaterThan(0);
    expect(testState.effortOptionsCalls.every((options) => options && (options as { activeEnergyKcalTarget?: number }).activeEnergyKcalTarget === 1_000)).toBe(true);
  });

  it("keeps a missing nutrition target as null so the score engine can use its 700 kcal fallback", async () => {
    await recomputeUserHealth("user-1");

    expect(testState.effortOptionsCalls.length).toBeGreaterThan(0);
    expect(testState.effortOptionsCalls.every((options) => options && (options as { activeEnergyKcalTarget?: number | null }).activeEnergyKcalTarget === null)).toBe(true);
  });
});
