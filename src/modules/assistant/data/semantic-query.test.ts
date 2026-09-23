import { describe, expect, it } from "vitest";

import type { HealthMetricDay, ScoreDay } from "@/services/health-analytics";
import { decodeAssistantCursor, encodeAssistantCursor, queryAssistantData } from "./semantic-query";

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

function sources(input: { health?: HealthMetricDay[]; scores?: ScoreDay[] } = {}) {
  return {
    profile: async () => ({ timezone: "Europe/Zurich", importedAt: "2026-09-21T09:00:00.000Z" }),
    health: async () => input.health ?? [], scores: async () => input.scores ?? [], nutrition: async () => [], activities: async () => [],
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
});
