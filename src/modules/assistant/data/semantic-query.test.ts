import { describe, expect, it, vi } from "vitest";

import type { Meal } from "@/domain/meals";
import { mealAnalysisSchema } from "@/domain/meals";
import type { ExerciseSummary, HealthMetricDay, ScoreDay } from "@/services/health-analytics";
import { decodeAssistantCursor, encodeAssistantCursor, queryAssistantData, type AssistantActivitySource, type AssistantSleepSessionSource } from "./semantic-query";

const mockDataSources = vi.hoisted(() => ({
  healthRows: [] as Array<Record<string, unknown>>,
  queries: [] as Array<{
    table: string;
    filters: Array<{ method: string; column: string; value: unknown }>;
    orders: Array<{ column: string; ascending: boolean }>;
    ranges: Array<[number, number]>;
  }>,
  mealCalls: [] as Array<{ userId: string; from: string; to: string; preferLatestCompletedAnalysis: boolean }>,
}));

vi.mock("@/lib/cloudflare/db", () => ({
  claimCloudflareLock: async () => true,
  claimCloudflareLockWithToken: async () => "test-lock",
  releaseCloudflareLock: async () => undefined,
  releaseCloudflareLockWithToken: async () => undefined,
  createCloudflareAdminClient: () => ({
    from(table: string) {
      const query: (typeof mockDataSources.queries)[number] = { table, filters: [], orders: [], ranges: [] };
      mockDataSources.queries.push(query);
      type FakeQuery = {
        select(columns?: string): FakeQuery;
        eq(column: string, value: unknown): FakeQuery;
        gte(column: string, value: unknown): FakeQuery;
        lte(column: string, value: unknown): FakeQuery;
        lt(column: string, value: unknown): FakeQuery;
        is(column: string, value: unknown): FakeQuery;
        order(column: string, options: { ascending: boolean }): FakeQuery;
        range(from: number, to: number): Promise<{ data: Array<Record<string, unknown>>; error: null }>;
        maybeSingle(): Promise<{ data: Record<string, unknown>; error: null }>;
      };
      const chain: FakeQuery = {
        select: () => chain,
        eq: (column, value) => { query.filters.push({ method: "eq", column, value }); return chain; },
        gte: (column, value) => { query.filters.push({ method: "gte", column, value }); return chain; },
        lte: (column, value) => { query.filters.push({ method: "lte", column, value }); return chain; },
        lt: (column, value) => { query.filters.push({ method: "lt", column, value }); return chain; },
        is: (column, value) => { query.filters.push({ method: "is", column, value }); return chain; },
        order: (column, options) => { query.orders.push({ column, ascending: options.ascending }); return chain; },
        range: async (from, to) => { query.ranges.push([from, to]); return { data: mockDataSources.healthRows, error: null }; },
        maybeSingle: async () => ({ data: table === "profiles" ? { timezone: "Europe/Zurich" } : { last_synced_at: null }, error: null }),
      };
      return chain;
    },
  }),
}));

vi.mock("@/repositories/meals", () => ({
  findMeal: async () => null,
  listMeals: async (userId: string, options: { from: string; to: string; preferLatestCompletedAnalysis: boolean }) => {
    mockDataSources.mealCalls.push({ userId, ...options });
    return [];
  },
}));

vi.mock("@/services/meals", () => ({ loadConfirmedMealRecords: async () => [] }));

const secret = "test-assistant-cursor-secret-123456";
const baseHealthDay = (date: string, steps: number | null): HealthMetricDay => ({
  metric_date: date,
  sleep_minutes: null, sleep_need_minutes: null, sleep_efficiency: null, sleep_regularity: null,
  sleep_latency_minutes: null, sleep_awake_minutes: null, sleep_awake_percent: null, sleep_awakenings: null,
  sleep_fragmentation: null, sleep_deep_minutes: null, sleep_deep_percent: null, sleep_rem_minutes: null,
  sleep_rem_percent: null, sleep_light_minutes: null, sleep_light_percent: null, daily_sleep_debt_minutes: null,
  cumulative_sleep_debt_minutes: null, bedtime: null, wake_time: null, hrv_ms: null, resting_heart_rate: null,
  respiratory_rate: null, oxygen_saturation: null, oxygen_saturation_lower: null, oxygen_saturation_upper: null,
  skin_temperature_delta: null, nightly_temperature_celsius: null, baseline_temperature_celsius: null, steps,
  active_energy_kcal: null, total_energy_kcal: null, zone_minutes: null, light_zone_minutes: null,
  moderate_zone_minutes: null, vigorous_zone_minutes: null, peak_zone_minutes: null, active_minutes: null,
  sedentary_minutes: null, exercise_minutes: null, distance_km: null, running_distance_km: null,
  running_duration_minutes: null, running_pace_seconds_per_km: null, running_average_heart_rate: null,
  floors: null, weight_kg: null, body_fat_percent: null, vo2_max: null, altitude_gain_m: null, height_cm: null,
  core_body_temperature_celsius: null, blood_glucose_mg_dl: null, active_day: null, active_day_rate_28d: null,
  activity_consistency_28d: null, weekly_load: null, acute_chronic_load_ratio: null,
  source_freshness: { latestMeasuredAt: `${date}T08:00:00.000Z` },
});

function sources(input: {
  health?: HealthMetricDay[]; scores?: ScoreDay[]; activities?: AssistantActivitySource[];
  sleepSessions?: AssistantSleepSessionSource[]; meals?: Meal[];
} = {}) {
  return {
    profile: async () => ({ timezone: "Europe/Zurich", importedAt: "2026-09-21T09:00:00.000Z" }),
    health: async () => input.health ?? [], scores: async () => input.scores ?? [], nutrition: async () => [],
    activities: async () => input.activities ?? [], sleepSessions: async () => input.sleepSessions ?? [], meals: async () => input.meals ?? [],
  };
}

function exercise(id: string, date: string): ExerciseSummary {
  return {
    id, date, name: "Morning Run", type: "RUNNING", durationMinutes: 42, activeMinutes: 40, calories: 400, distanceKm: 8,
    averageHeartRate: 148, maximumHeartRate: 171, zoneMinutes: 26, averageSpeedKph: 11.4,
    averagePaceSecondsPerKm: 315.8, elevationGainMeters: 36, steps: 7_800, runVo2Max: null, swimLengths: null,
    cadence: 168, strideLengthMeters: 1.1, groundContactMilliseconds: 245, verticalOscillationMillimeters: 8,
    verticalRatio: 7.2,
  };
}

function mealFixture(date: string): Meal {
  const analysis = mealAnalysisSchema.parse({
    summary: "A bowl of oatmeal",
    foods: [],
    totals: {
      calories: { low: 400, likely: 450, high: 500 }, proteinGrams: { low: 12, likely: 15, high: 18 },
      carbohydrateGrams: { low: 55, likely: 60, high: 65 }, fatGrams: { low: 10, likely: 12, high: 14 },
      fiberGrams: { low: 7, likely: 9, high: 11 }, sugarGrams: null, addedSugarGrams: null,
    },
    confidence: "high", uncertainties: [],
  });
  return {
    id: `meal-${date}`, userId: "user-1", mealDate: date, mealType: "breakfast", note: "Before training", status: "confirmed",
    entryState: "recorded", mouthWarmthIntensity: null, stomachOverfullIntensity: null,
    createdAt: `${date}T07:30:00.000Z`, updatedAt: `${date}T07:35:00.000Z`,
    photos: [{ id: "photo-private", mealId: `meal-${date}`, origin: "homemade", objectPath: "private/path.png", mimeType: "image/png", bytes: 1234, filename: null, comment: null, createdAt: `${date}T07:30:00.000Z`, storageStatus: "available", purgedAt: null }],
    analysis: { id: "analysis-1", mealId: `meal-${date}`, status: "completed", provider: "provider-x", model: "model-y", result: analysis, error: null, sourcePhotoIds: [], createdAt: `${date}T07:35:00.000Z`, completedAt: `${date}T07:35:00.000Z` },
    lastSuccessfulAnalysis: null,
  };
}

describe("assistant semantic data queries", () => {
  it("preserves explicit zero and missing as different states", async () => {
    const result = await queryAssistantData("user-1", {
      dataset: "daily_health", period: { from: "2026-09-20", to: "2026-09-21" }, metrics: ["steps"], pagination: { limit: 100, cursor: null, order: "asc" },
    }, { sources: sources({ health: [baseHealthDay("2026-09-20", 0), baseHealthDay("2026-09-21", null)] }), cursorSecret: secret, now: new Date("2026-09-21T10:00:00Z") });

    expect(result.items[0]).toMatchObject({ type: "daily", observations: [{ value: 0, availability: "observed" }] });
    expect(result.items[1]).toMatchObject({ type: "daily", observations: [{ value: null, availability: "missing" }] });
  });

  it("distinguishes a non-calculable Soma metric from absent source data", async () => {
    const result = await queryAssistantData("user-1", {
      dataset: "daily_health", period: { from: "2026-09-21", to: "2026-09-21" }, metrics: ["weekly_load", "steps"], pagination: { limit: 100, cursor: null, order: "asc" },
    }, { sources: sources({ health: [baseHealthDay("2026-09-21", null)] }), cursorSecret: secret });

    expect(result.items[0]).toMatchObject({
      observations: [
        { metric: "weekly_load", value: null, availability: "not_calculable" },
        { metric: "steps", value: null, availability: "missing" },
      ],
    });
  });

  it("paginates without silent truncation and reports completeness", async () => {
    const health = [baseHealthDay("2026-09-19", 1), baseHealthDay("2026-09-20", 2), baseHealthDay("2026-09-21", 3)];
    const first = await queryAssistantData("user-1", {
      dataset: "daily_health", period: { from: "2026-09-19", to: "2026-09-21" }, metrics: ["steps"], pagination: { limit: 2, cursor: null, order: "asc" },
    }, { sources: sources({ health }), cursorSecret: secret });
    expect(first.manifest).toMatchObject({ totalItems: 3, returnedItems: 2, hasMore: true, complete: false });

    const second = await queryAssistantData("user-1", {
      dataset: "daily_health", period: { from: "2026-09-19", to: "2026-09-21" }, metrics: ["steps"], pagination: { limit: 2, cursor: first.manifest.nextCursor, order: "asc" },
    }, { sources: sources({ health }), cursorSecret: secret });
    expect(second.items).toHaveLength(1);
    expect(second.manifest).toMatchObject({ hasMore: false, complete: true });
  });

  it("retrieves a four-month history across pages without losing days", async () => {
    const start = Date.parse("2026-01-01T00:00:00Z");
    const health = Array.from({ length: 120 }, (_, index) => baseHealthDay(new Date(start + index * 86_400_000).toISOString().slice(0, 10), index));
    const period = { from: "2026-01-01", to: "2026-04-30" };
    let cursor: string | null = null;
    const collected: string[] = [];
    do {
      const page = await queryAssistantData("user-1", {
        dataset: "daily_health", period, metrics: ["steps"], pagination: { limit: 35, cursor, order: "asc" },
      }, { sources: sources({ health }), cursorSecret: secret });
      collected.push(...page.items.map((item) => item.date));
      cursor = page.manifest.nextCursor;
      if (!cursor) expect(page.manifest.complete).toBe(true);
    } while (cursor);
    expect(collected).toEqual(health.map((day) => day.metric_date));
    expect(new Set(collected).size).toBe(120);
  });

  it("rejects altered and cross-dataset cursors", () => {
    const cursor = encodeAssistantCursor({ version: 1, dataset: "daily_health", queryHash: "query-a", position: "2026-09-20" }, secret);
    expect(() => decodeAssistantCursor(`${cursor}x`, "daily_health", secret)).toThrow(/signature/);
    expect(() => decodeAssistantCursor(cursor, "scores", secret)).toThrow(/does not match/);
  });

  it("binds pagination cursors to the requested period, filters, and order", async () => {
    const health = [baseHealthDay("2026-09-20", 1), baseHealthDay("2026-09-21", 2)];
    const first = await queryAssistantData("user-1", {
      dataset: "daily_health", period: { from: "2026-09-20", to: "2026-09-21" }, metrics: ["steps"], pagination: { limit: 1, cursor: null, order: "asc" },
    }, { sources: sources({ health }), cursorSecret: secret });

    await expect(queryAssistantData("user-1", {
      dataset: "daily_health", period: { from: "2026-09-19", to: "2026-09-21" }, metrics: ["steps"], pagination: { limit: 1, cursor: first.manifest.nextCursor, order: "asc" },
    }, { sources: sources({ health }), cursorSecret: secret })).rejects.toThrow(/does not match/);
  });

  it("returns canonical persisted scores and algorithm versions", async () => {
    const result = await queryAssistantData("user-1", {
      dataset: "scores", period: { from: "2026-09-21", to: "2026-09-21" }, kinds: ["recovery"], pagination: { limit: 10, cursor: null, order: "asc" },
    }, { sources: sources({ scores: [{ score_date: "2026-09-21", kind: "recovery", score: 0, drivers: {}, algorithm_version: "recovery-v1" }] }), cursorSecret: secret });
    expect(result.items[0]).toMatchObject({ type: "score", observation: { value: 0, availability: "observed", provenance: { algorithmVersion: "recovery-v1" } } });
  });

  it("returns the matching activity with its source identity and rejects rows outside the requested day", async () => {
    const activitySource = (id: string, date: string): AssistantActivitySource => ({
      activity: exercise(id, date), provider: "google_health", startTime: `${date}T16:00:00.000Z`,
      endTime: `${date}T16:42:00.000Z`, importedAt: `${date}T17:00:00.000Z`,
    });
    const result = await queryAssistantData("user-1", {
      dataset: "activities", period: { from: "2026-09-24", to: "2026-09-24" }, activityTypes: ["running"],
    }, { sources: sources({ activities: [activitySource("run-today", "2026-09-24"), activitySource("run-old", "2026-06-04")] }), cursorSecret: secret });

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item).toMatchObject({ type: "activity", date: "2026-09-24", activity: { id: "run-today", distanceKm: 8 } });
    if (item.type === "activity") expect(item.observations).toContainEqual(expect.objectContaining({ metric: "duration_minutes", value: 42, provenance: { source: "soma_calculation", provider: "google_health", algorithmVersion: "session-times-v1" } }));
    expect(result.manifest).toMatchObject({ requestedPeriod: { from: "2026-09-24", to: "2026-09-24" }, coveredPeriod: { from: "2026-09-24", to: "2026-09-24" }, timezone: "Europe/Zurich" });
  });

  it("flags zone minutes exceeding the session duration without changing source values", async () => {
    const activity = { ...exercise("run-today", "2026-09-24"), durationMinutes: 50, zoneMinutes: 97 };
    const result = await queryAssistantData("user-1", {
      dataset: "activities", period: { from: "2026-09-24", to: "2026-09-24" },
    }, { sources: sources({ activities: [{ activity, provider: "google_health", startTime: "2026-09-24T15:00:00Z", endTime: "2026-09-24T15:50:00Z", importedAt: null }] }), cursorSecret: secret });

    expect(result.items[0]).toMatchObject({ type: "activity", qualityFlags: ["zone_minutes_exceed_duration"], activity: { zoneMinutes: 97 } });
  });

  it("marks a pace derived from the raw exercise payload as a Soma calculation", async () => {
    mockDataSources.queries.length = 0;
    mockDataSources.healthRows = [{
      provider: "google_health", source_device: "Watch", source_record_id: "run-derived-pace", civil_date: "2026-09-24",
      start_time: "2026-09-24T16:00:00.000Z", end_time: "2026-09-24T16:40:00.000Z", updated_at: "2026-09-24T17:00:00.000Z",
      payload: { exercise: { exerciseType: "RUNNING", activeDuration: "2400s", metricsSummary: { distanceMillimeters: 8_000_000 } } },
    }];

    const result = await queryAssistantData("user-1", {
      dataset: "activities", period: { from: "2026-09-24", to: "2026-09-24" },
    }, { cursorSecret: secret });

    const item = result.items[0];
    expect(item).toMatchObject({ type: "activity", activity: { averagePaceSecondsPerKm: 300 } });
    if (item.type === "activity") expect(item.observations).toContainEqual(expect.objectContaining({
      metric: "average_pace_seconds_per_km", value: 300,
      provenance: { source: "soma_calculation", provider: "google_health", algorithmVersion: "activity-derived-pace-v1" },
    }));
  });

  it("bounds default activity and sleep reads by user and requested period, with stable storage ordering", async () => {
    const activityRow = {
      provider: "google_health", source_device: "Watch", source_record_id: "run-default", civil_date: "2026-09-24",
      start_time: "2026-09-24T16:00:00.000Z", end_time: "2026-09-24T16:40:00.000Z", updated_at: "2026-09-24T17:00:00.000Z",
      payload: { exercise: { exerciseType: "RUNNING", activeDuration: "2400s", metricsSummary: { distanceMillimeters: 8_000_000 } } },
    };
    mockDataSources.queries.length = 0;
    mockDataSources.healthRows = [activityRow];
    await queryAssistantData("user-1", {
      dataset: "activities", period: { from: "2026-09-24", to: "2026-09-24" },
    }, { cursorSecret: secret });

    const activityQueries = mockDataSources.queries.filter((query) => query.table === "health_records");
    expect(activityQueries).toHaveLength(2);
    for (const query of activityQueries) {
      expect(query.filters).toContainEqual({ method: "eq", column: "user_id", value: "user-1" });
      expect(query.filters).toContainEqual({ method: "eq", column: "data_type", value: "exercise" });
      expect(query.ranges).toEqual([[0, 499]]);
      expect(query.orders.map(({ column }) => column)).toEqual(["civil_date", "end_time", "provider", "source_record_id"]);
    }
    expect(activityQueries[0].filters).toContainEqual({ method: "gte", column: "civil_date", value: "2026-09-24" });
    expect(activityQueries[0].filters).toContainEqual({ method: "lte", column: "civil_date", value: "2026-09-24" });
    expect(activityQueries[1].filters).toContainEqual({ method: "gte", column: "start_time", value: "2026-09-23T00:00:00.000Z" });
    expect(activityQueries[1].filters).toContainEqual({ method: "lt", column: "start_time", value: "2026-09-26T00:00:00.000Z" });

    mockDataSources.queries.length = 0;
    mockDataSources.healthRows = [{ ...activityRow, source_record_id: "sleep-default", payload: { sleep: { summary: { minutesAsleep: 420 } } } }];
    await queryAssistantData("user-1", {
      dataset: "sleep_sessions", period: { from: "2026-09-24", to: "2026-09-24" },
    }, { cursorSecret: secret });
    const sleepQueries = mockDataSources.queries.filter((query) => query.table === "health_records");
    expect(sleepQueries).toHaveLength(3);
    for (const query of sleepQueries) {
      expect(query.filters).toContainEqual({ method: "eq", column: "user_id", value: "user-1" });
      expect(query.filters).toContainEqual({ method: "eq", column: "data_type", value: "sleep" });
      expect(query.ranges).toEqual([[0, 499]]);
      expect(query.orders.map(({ column }) => column)).toEqual(["civil_date", "end_time", "provider", "source_record_id"]);
    }
    expect(sleepQueries[1].filters).toContainEqual({ method: "gte", column: "end_time", value: "2026-09-23T00:00:00.000Z" });
    expect(sleepQueries[1].filters).toContainEqual({ method: "lt", column: "end_time", value: "2026-09-26T00:00:00.000Z" });

    mockDataSources.mealCalls.length = 0;
    await queryAssistantData("user-1", {
      dataset: "meals", period: { from: "2026-09-23", to: "2026-09-25" },
    }, { cursorSecret: secret });
    expect(mockDataSources.mealCalls).toEqual([{
      userId: "user-1", from: "2026-09-23", to: "2026-09-25", preferLatestCompletedAnalysis: true,
    }]);
  });

  it("loads the profile context and requested dataset concurrently", async () => {
    let releaseProfile: ((value: { timezone: string; importedAt: string | null }) => void) | undefined;
    let healthStarted = false;
    const profilePromise = new Promise<{ timezone: string; importedAt: string | null }>((resolve) => { releaseProfile = resolve; });
    const dataSources = {
      ...sources(),
      profile: () => profilePromise,
      health: async () => { healthStarted = true; return []; },
    };

    const resultPromise = queryAssistantData("user-1", {
      dataset: "daily_health", period: { from: "2026-09-24", to: "2026-09-24" }, metrics: ["steps"],
    }, { sources: dataSources, cursorSecret: secret });
    await Promise.resolve();
    expect(healthStarted).toBe(true);
    releaseProfile?.({ timezone: "Europe/Zurich", importedAt: null });
    await expect(resultPromise).resolves.toMatchObject({ manifest: { timezone: "Europe/Zurich" } });
  });

  it("returns a targeted sleep session with the source record id and extracted metrics, without the raw payload", async () => {
    const sleepSession: AssistantSleepSessionSource = {
      provider: "google_health", sourceDevice: "Watch", sourceRecordId: "sleep-2026-09-24", civilDate: "2026-09-24",
      startTime: "2026-09-23T22:30:00.000Z", endTime: "2026-09-24T06:30:00.000Z", updatedAt: "2026-09-24T07:00:00.000Z",
      payload: { privateVendorField: "must-not-escape", sleep: { summary: { minutesAsleep: 430, minutesInSleepPeriod: 480, minutesAwake: 50, minutesToFallAsleep: 10, stagesSummary: [{ type: "DEEP", minutes: 90, count: 3 }] }, stages: [{ type: "DEEP", startTime: "2026-09-24T01:00:00Z", endTime: "2026-09-24T02:30:00Z", duration: "5400s" }] } },
    };
    const result = await queryAssistantData("user-1", { dataset: "sleep_sessions", period: { from: "2026-09-24", to: "2026-09-24" } }, { sources: sources({ sleepSessions: [sleepSession] }), cursorSecret: secret });

    const item = result.items[0];
    expect(item).toMatchObject({
      type: "sleep_session", date: "2026-09-24",
      session: { id: "sleep-2026-09-24", durationMinutes: 480, sleepMinutes: 430, sourceDevice: "Watch", provider: "google_health", stagesSummary: [{ type: "DEEP", minutes: 90, count: 3 }] },
    });
    if (item.type === "sleep_session") expect(item.observations).toContainEqual(expect.objectContaining({ metric: "sleep_minutes", value: 430, availability: "observed" }));
    expect(JSON.stringify(result)).not.toContain("must-not-escape");
  });

  it("returns targeted meal records and nutrition estimates without photo storage paths", async () => {
    const result = await queryAssistantData("user-1", {
      dataset: "meals", period: { from: "2026-09-24", to: "2026-09-24" }, mealTypes: ["breakfast"],
    }, { sources: sources({ meals: [mealFixture("2026-09-24"), mealFixture("2026-06-04")] }), cursorSecret: secret });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      type: "meal", date: "2026-09-24", meal: {
        id: "meal-2026-09-24", mealType: "breakfast", analysis: {
          totals: { calories: { likely: 450 }, proteinGrams: { likely: 15 } },
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("private/path.png");
    expect(result.manifest.coveredPeriod).toEqual({ from: "2026-09-24", to: "2026-09-24" });
  });

  it("keeps drafts and explicitly skipped meal slots visible without counting them as nutrition", async () => {
    const draft = { ...mealFixture("2026-09-24"), id: "meal-draft", status: "draft" as const };
    const skipped = { ...mealFixture("2026-09-24"), id: "meal-skipped", entryState: "skipped" as const };
    const result = await queryAssistantData("user-1", {
      dataset: "meals", period: { from: "2026-09-24", to: "2026-09-24" },
    }, { sources: sources({ meals: [draft, skipped] }), cursorSecret: secret });

    expect(result.items).toHaveLength(2);
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ meal: expect.objectContaining({ id: "meal-draft", status: "draft", nutritionEligible: false, nutritionExclusionReason: "draft", analysis: null }) }),
      expect.objectContaining({ meal: expect.objectContaining({ id: "meal-skipped", entryState: "skipped", nutritionEligible: false, nutritionExclusionReason: "explicitly_skipped", analysis: null }) }),
    ]));
    for (const item of result.items) {
      if (item.type === "meal") expect(item.observations.every((observation) => observation.availability === "not_calculable" && observation.value === null)).toBe(true);
    }
  });
});
