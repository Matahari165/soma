import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { aggregateHealthRecords, type NormalizedHealthRecord } from "@/domain/health/aggregate";

type GteCall = { table: string; column: string; value: string };
type UpsertCall = { table: string; rows: unknown };

const testState = vi.hoisted(() => ({
  adminFrom: vi.fn(),
  healthRecordsForAnalysis: vi.fn(),
  gteCalls: [] as GteCall[],
  upsertCalls: [] as UpsertCall[],
  effortOptionsCalls: [] as unknown[],
  nutritionTargetState: { persisted: false, targets: { caloriesKcal: { likely: 700 } } },
}));

vi.mock("@/lib/cloudflare/db", () => ({
  createCloudflareAdminClient: () => ({ from: testState.adminFrom }),
  healthRecordsForAnalysis: testState.healthRecordsForAnalysis,
}));
vi.mock("@/domain/briefs/generate", () => ({
  generateEveningBrief: () => "evening",
  generateMorningBrief: () => "morning",
  generateWeeklyBrief: () => "weekly",
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
vi.mock("@/domain/scores/effort", () => ({
  calculateEffortScoreFromAvailable: (_input: unknown, options: unknown) => {
    testState.effortOptionsCalls.push(options);
    return { score: 50, status: "steady", coverage: 1, algorithmVersion: "test" };
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
  analysisWindowFor,
  changedDerivedRows,
  healthRecordCoverageDates,
  minutesSinceMidnightIn,
  recomputeUserHealth,
  rollingAnalysisStart,
} from "./analysis";

type TestQuery = {
  select: (columns?: string) => TestQuery;
  eq: (column: string, value: unknown) => TestQuery;
  gte: (column: string, value: string) => TestQuery;
  single: () => Promise<{ data: unknown; error: null }>;
  upsert: (rows: unknown) => Promise<{ error: null }>;
  delete: () => TestQuery;
  in: (column: string, values: unknown[]) => Promise<{ error: null }>;
  then: Promise<unknown>["then"];
};

function configureAdminQueries() {
  testState.adminFrom.mockImplementation((table: string) => {
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
    query.then = ((resolve, reject) => Promise.resolve(result).then(resolve, reject)) as TestQuery["then"];
    return query;
  });
}

const sourceRecords: NormalizedHealthRecord[] = [
  {
    data_type: "exercise",
    civil_date: "2026-08-01",
    start_time: "2026-08-01T10:00:00Z",
    end_time: "2026-08-01T10:25:00Z",
    measured_at: null,
    payload: { exercise: { exerciseType: "RUNNING", metricsSummary: { distanceMillimeters: 5_000_000 } } },
  },
  {
    data_type: "steps",
    civil_date: "2026-08-02",
    start_time: null,
    end_time: null,
    measured_at: "2026-08-02T12:00:00Z",
    payload: { steps: { count: 4_200 } },
  },
  {
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
    testState.effortOptionsCalls.length = 0;
    testState.nutritionTargetState = { persisted: false, targets: { caloriesKcal: { likely: 700 } } };
    testState.healthRecordsForAnalysis.mockReset();
    testState.healthRecordsForAnalysis.mockResolvedValue(sourceRecords);
    configureAdminQueries();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("uses the same selected start for source reads, daily reads and stale-row cleanup", async () => {
    await recomputeUserHealth("user-1");
    const recentSourceStart = testState.healthRecordsForAnalysis.mock.calls.at(-1)?.[2];
    expect(recentSourceStart).toBe("2026-07-13");
    expect(testState.gteCalls.filter((call) => call.table === "daily_health_metrics" || call.table === "daily_scores").every((call) => call.value === recentSourceStart)).toBe(true);

    testState.gteCalls.length = 0;
    testState.upsertCalls.length = 0;
    await recomputeUserHealth("user-1", { windowDays: 90 });
    const historicalSourceStart = testState.healthRecordsForAnalysis.mock.calls.at(-1)?.[2];
    expect(historicalSourceStart).toBe("2026-05-29");
    expect(testState.gteCalls.filter((call) => call.table === "daily_health_metrics" || call.table === "daily_scores").every((call) => call.value === historicalSourceStart)).toBe(true);
  });

  it("persists null running metrics on a covered day without a run", async () => {
    await recomputeUserHealth("user-1", { windowDays: 90 });
    const metricRows = (testState.upsertCalls.find((call) => call.table === "daily_health_metrics")?.rows ?? []) as Array<Record<string, unknown>>;
    const noRunDay = metricRows.find((row) => row.metric_date === "2026-08-02");

    expect(noRunDay).toBeDefined();
    expect(noRunDay?.running_distance_km).toBeNull();
    expect(noRunDay?.running_pace_seconds_per_km).toBeNull();
    expect(noRunDay?.running_average_heart_rate).toBeNull();
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
