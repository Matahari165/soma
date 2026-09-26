import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExerciseSummary, HealthMetricDay, ScoreDay } from "@/services/health-analytics";
import { decodeAssistantCursor, encodeAssistantCursor, queryAssistantData, type AssistantPageRequest } from "./semantic-query";
import { assistantHealthMetricCatalog } from "./health-catalog";

const storage = vi.hoisted(() => ({ records: [] as Record<string, unknown>[], ranges: [] as number[] }));
vi.mock("@/lib/cloudflare/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cloudflare/db")>();
  const { matches, sortRows } = await import("@/lib/cloudflare/db-query");
  return { ...actual, createCloudflareAdminClient: () => ({ from: (table: string) => {
    let rows = table === "health_records" ? [...storage.records] : [];
    const sorts: Array<{ field: string; ascending: boolean }> = [];
    const builder = {
      select: () => builder,
      eq: (field: string, value: unknown) => filter(field, "eq", value),
      gte: (field: string, value: unknown) => filter(field, "gte", value),
      lte: (field: string, value: unknown) => filter(field, "lte", value),
      lt: (field: string, value: unknown) => filter(field, "lt", value),
      is: (field: string, value: unknown) => filter(field, "is", value),
      in: (field: string, value: unknown[]) => filter(field, "in", value),
      order: (field: string, options: { ascending: boolean }) => { sorts.push({ field, ...options }); return builder; },
      range: async (from: number, to: number) => {
        storage.ranges.push(to - from + 1);
        return { data: sortRows(rows, sorts).slice(from, to + 1), error: null };
      },
      maybeSingle: async () => ({ data: table === "profiles" ? { timezone: "Europe/Paris" } : null, error: null }),
    };
    const filter = (field: string, operator: "eq" | "gte" | "lte" | "lt" | "is" | "in", value: unknown) => {
      rows = rows.filter((row) => matches(row, { field, operator, value }));
      return builder;
    };
    return builder;
  } }) };
});
afterEach(() => { storage.records = []; storage.ranges = []; });

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

function sources(input: { health?: HealthMetricDay[]; scores?: ScoreDay[]; activities?: ExerciseSummary[] } = {}) {
  return {
    profile: async () => ({ timezone: "Europe/Zurich", importedAt: "2026-09-21T09:00:00.000Z" }),
    health: async () => input.health ?? [], scores: async () => input.scores ?? [], nutrition: async () => [], activities: async () => input.activities ?? [],
  };
}

function activity(id: string, date: string, type: string): ExerciseSummary {
  return {
    id, date, type, name: type, durationMinutes: 45, activeMinutes: 40, calories: 300, distanceKm: null,
    averageHeartRate: 145, maximumHeartRate: 180, zoneMinutes: 30, averageSpeedKph: null,
    averagePaceSecondsPerKm: null, elevationGainMeters: null, steps: null, runVo2Max: null,
    swimLengths: null, cadence: null, strideLengthMeters: null, groundContactMilliseconds: null,
    verticalOscillationMillimeters: null, verticalRatio: null,
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

  it("returns clock and boolean health metrics in their native types", async () => {
    const day = { ...baseHealthDay("2026-09-21", 0), bedtime: "2026-09-20T22:40:00.000Z", active_day: false };
    const result = await queryAssistantData("user-1", {
      dataset: "daily_health", period: { from: "2026-09-21", to: "2026-09-21" }, metrics: ["bedtime", "active_day"], pagination: { limit: 100, cursor: null, order: "asc" },
    }, { sources: sources({ health: [day] }), cursorSecret: secret });

    expect(result.items[0]).toMatchObject({ observations: [
      { metric: "bedtime", value: "2026-09-20T22:40:00.000Z", availability: "observed", unit: "local time" },
      { metric: "active_day", value: false, availability: "observed", unit: "yes/no" },
    ] });
  });

  it("filters more than 500 activities by period and French activity alias before reporting totals and pages", async () => {
    const activities = [
      ...Array.from({ length: 520 }, (_, index) => activity(`run-${index.toString().padStart(4, "0")}`, "2026-09-10", "RUNNING")),
      ...Array.from({ length: 8 }, (_, index) => activity(`boxing-${index.toString().padStart(2, "0")}`, "2026-09-10", "BOXING")),
      activity("boxing-outside-period", "2026-08-26", "BOXING"),
    ];
    const first = await queryAssistantData("user-1", {
      dataset: "activities", period: { from: "2026-08-27", to: "2026-09-26" }, activityTypes: ["boxe"], pagination: { limit: 5, cursor: null, order: "desc" },
    }, { sources: sources({ activities }), cursorSecret: secret });

    expect(first.manifest).toMatchObject({ totalItems: 8, returnedItems: 5, hasMore: true });
    expect(first.items.every((item) => item.type === "activity" && item.activity.type === "BOXING")).toBe(true);

    const second = await queryAssistantData("user-1", {
      dataset: "activities", period: { from: "2026-08-27", to: "2026-09-26" }, activityTypes: ["boxe"], pagination: { limit: 5, cursor: first.manifest.nextCursor, order: "desc" },
    }, { sources: sources({ activities }), cursorSecret: secret });
    expect(second.manifest).toMatchObject({ totalItems: 8, returnedItems: 3, hasMore: false, complete: true });
  });

  it("allows the full health metric catalog as a targeted query", async () => {
    const result = await queryAssistantData("user-1", {
      dataset: "daily_health", period: { from: "2026-09-21", to: "2026-09-21" },
      metrics: assistantHealthMetricCatalog.map((metric) => metric.key), pagination: { limit: 10, cursor: null, order: "asc" },
    }, { sources: sources({ health: [baseHealthDay("2026-09-21", 42)] }), cursorSecret: secret });

    expect(result.items[0]?.type === "daily" ? result.items[0].observations : []).toHaveLength(assistantHealthMetricCatalog.length);
    const observations = result.items[0]?.type === "daily" ? result.items[0].observations : [];
    expect(observations.find((observation) => observation.metric === "steps")).toMatchObject({ value: 42, availability: "observed" });
    expect(observations.find((observation) => observation.metric === "bedtime")).toMatchObject({ value: null, availability: "missing" });
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

  it("uses a signed storage cursor and reports unknown totals without inventing a count", async () => {
    const source = sources();
    const health = vi.fn(async (_userId: string, _period: { from: string; to: string }, _metrics: string[], page: AssistantPageRequest) => page.position === null
      ? { items: [baseHealthDay("2026-09-20", 1)], hasMore: true, nextPosition: "2026-09-20", totalItems: null }
      : { items: [baseHealthDay("2026-09-21", 2)], hasMore: false, nextPosition: null, totalItems: null });
    const first = await queryAssistantData("user-1", {
      dataset: "daily_health", period: { from: "2026-09-20", to: "2026-09-21" }, metrics: ["steps"], pagination: { limit: 1, cursor: null, order: "asc" },
    }, { sources: { ...source, health }, cursorSecret: secret });
    expect(first.manifest).toMatchObject({ totalItems: null, totalKnown: false, hasMore: true, complete: false });

    const second = await queryAssistantData("user-1", {
      dataset: "daily_health", period: { from: "2026-09-20", to: "2026-09-21" }, metrics: ["steps"], pagination: { limit: 1, cursor: first.manifest.nextCursor, order: "asc" },
    }, { sources: { ...source, health }, cursorSecret: secret });
    expect(health.mock.calls[1]?.[3]).toMatchObject({ limit: 1, position: "2026-09-20", order: "asc" });
    expect(second.manifest).toMatchObject({ totalItems: null, totalKnown: false, returnedItems: 1, hasMore: false, complete: true });
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

  it("binds pagination cursors to the authenticated user", async () => {
    const health = [baseHealthDay("2026-09-20", 1), baseHealthDay("2026-09-21", 2)];
    const first = await queryAssistantData("user-1", {
      dataset: "daily_health", period: { from: "2026-09-20", to: "2026-09-21" }, metrics: ["steps"], pagination: { limit: 1, cursor: null, order: "asc" },
    }, { sources: sources({ health }), cursorSecret: secret });

    await expect(queryAssistantData("user-2", {
      dataset: "daily_health", period: { from: "2026-09-20", to: "2026-09-21" }, metrics: ["steps"], pagination: { limit: 1, cursor: first.manifest.nextCursor, order: "asc" },
    }, { sources: sources({ health }), cursorSecret: secret })).rejects.toThrow(/does not match/);
  });

  it("returns canonical persisted scores and algorithm versions", async () => {
    const result = await queryAssistantData("user-1", {
      dataset: "scores", period: { from: "2026-09-21", to: "2026-09-21" }, kinds: ["recovery"], pagination: { limit: 10, cursor: null, order: "asc" },
    }, { sources: sources({ scores: [{ score_date: "2026-09-21", kind: "recovery", score: 0, drivers: {}, algorithm_version: "recovery-v1" }] }), cursorSecret: secret });
    expect(result.items[0]).toMatchObject({ type: "score", observation: { value: 0, availability: "observed", provenance: { algorithmVersion: "recovery-v1" } } });
  });
});

describe("default activity storage pagination", () => {
  it.each(["asc", "desc"] as const)("consumes storage prefixes with null times and equal keys (%s)", async (order) => {
    const row = (id: string, civilDate: string | null, time: string | null, provider = "google_health") => ({
      user_id: "user-1", data_type: "exercise", provider, source_record_id: id,
      civil_date: civilDate, start_time: time, end_time: null,
      payload: { exercise: { exerciseType: "RUNNING" } },
    });
    storage.records = [
      row("A", "2026-09-26", "2026-09-26T10:00:00Z"),
      row("B", "2026-09-26", null),
      row("C", null, "2026-09-26T05:00:00Z"),
      row("Z", "2026-09-26", "2026-09-26T10:00:00Z"),
      row("a", "2026-09-26", "2026-09-26T10:00:00Z"),
      row("D", null, "2026-09-26T10:00:00Z"),
      row("outside", "2026-09-25", "2026-09-25T10:00:00Z"),
      { ...row("other-user", "2026-09-26", null), user_id: "user-2" },
    ];
    const ids: string[] = [];
    let cursor: string | null = null;
    for (let index = 0; index < 10; index += 1) {
      const result = await queryAssistantData("user-1", {
        dataset: "activities", period: { from: "2026-09-26", to: "2026-09-26" },
        activityTypes: ["running"], pagination: { limit: 2, cursor, order },
      }, { cursorSecret: secret });
      ids.push(...result.items.flatMap((item) => item.type === "activity" ? [item.activity.id] : []));
      cursor = result.manifest.nextCursor;
      if (!result.manifest.hasMore) { expect(result.manifest.complete).toBe(true); break; }
    }
    expect(cursor).toBeNull();
    expect(ids).toEqual(order === "asc" ? ["C", "A", "Z", "a", "D", "B"] : ["B", "a", "Z", "A", "D", "C"]);
    expect(storage.ranges.every((size) => size === 3)).toBe(true);
  });
});
