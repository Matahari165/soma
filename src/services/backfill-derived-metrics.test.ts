import { describe, expect, it } from "vitest";

import { buildPlan, buildSql, parseRowsText } from "../../scripts/backfill-derived-metrics.mjs";

const userId = "user-backfill-test";

function exercise(overrides: Record<string, unknown> = {}) {
  return {
    user_id: userId,
    provider: "whoop_export",
    data_type: "exercise",
    source_record_id: "whoop-exercise-1",
    civil_date: "2026-05-28",
    start_time: "2026-05-28T10:00:00+02:00",
    end_time: "2026-05-28T10:30:00+02:00",
    measured_at: "2026-05-28T10:30:00+02:00",
    recording_method: "PASSIVELY_MEASURED",
    source_device: "WHOOP",
    payload: { source: { provider: "whoop_export" }, exercise: { exerciseType: "RUNNING", metricsSummary: { averageHeartRate: 150 } } },
    ...overrides,
  };
}

function takeoutExercise(overrides: Record<string, unknown> = {}) {
  return {
    ...exercise({
      provider: "google_health",
      source_device: "Google Fitbit Air",
      recording_method: "TAKEOUT_VERIFIED",
      civil_date: "2026-05-29",
      source_record_id: "takeout-exercise-1",
      start_time: "2026-05-29T10:00:00+02:00",
      end_time: "2026-05-29T10:40:00+02:00",
      measured_at: "2026-05-29T10:40:00+02:00",
      payload: { source: { provider: "google_takeout" }, exercise: { exerciseType: "JOGGING", metricsSummary: { distanceMillimeters: 5_000_000, averageHeartRateBeatsPerMinute: 160 } } },
    }),
    ...overrides,
  };
}

describe("offline derived wearable metric backfill", () => {
  it("merges an enrichment, keeps WHOOP distance unknown, and derives Google running fields", () => {
    const enrichedWhoop = exercise({ payload: { source: { provider: "whoop_export" }, exercise: { exerciseType: "RUNNING", metricsSummary: { averageHeartRate: 150, distanceMillimeters: 4_000_000 } } } });
    const sedentary = {
      user_id: userId,
      provider: "google_health",
      data_type: "sedentary-period",
      source_record_id: "takeout-sedentary-1",
      civil_date: "2026-05-29",
      payload: { source: { provider: "google_takeout" }, dailyRollup: { sedentaryPeriod: { durationSum: "36000s" } } },
    };
    const vo2 = {
      user_id: userId,
      provider: "google_health",
      data_type: "daily-vo2-max",
      source_record_id: "takeout-vo2-1",
      civil_date: "2026-05-29",
      payload: { source: { provider: "google_takeout" }, dailyVo2Max: { vo2Max: 48.5 } },
    };
    const plan = buildPlan({
      existingRecords: [exercise(), takeoutExercise({ payload: { source: { provider: "google_takeout" }, exercise: { exerciseType: "JOGGING", metricsSummary: { averageHeartRateBeatsPerMinute: 160 } } } })],
      candidates: [enrichedWhoop, takeoutExercise(), sedentary, vo2],
      existingMetrics: [{ user_id: userId, metric_date: "2026-05-29", sleep_minutes: 480, steps: 9000 }],
    });

    const may = plan.rows.find((row) => row.metric_date === "2026-05-28");
    const google = plan.rows.find((row) => row.metric_date === "2026-05-29");
    expect(may?.derived.running_distance_km).toBe(4);
    expect(may?.derived.running_pace_seconds_per_km).toBe(450);
    expect(google?.derived.running_distance_km).toBe(5);
    expect(google?.derived.running_duration_minutes).toBe(40);
    expect(google?.derived.running_pace_seconds_per_km).toBe(480);
    expect(google?.derived.running_average_heart_rate).toBe(160);
    expect(google?.derived.sedentary_minutes).toBe(600);
    expect(google?.derived.vo2_max).toBe(48.5);
    expect(google?.writeValues).toMatchObject({ running_distance_km: 5, sedentary_minutes: 600, vo2_max: 48.5 });
    expect(google?.writeValues).not.toHaveProperty("sleep_minutes");
    expect(google?.writeValues).not.toHaveProperty("steps");
  });

  it("does not overwrite a conflicting existing target value", () => {
    const plan = buildPlan({
      candidates: [takeoutExercise()],
      existingMetrics: [{ user_id: userId, metric_date: "2026-05-29", running_distance_km: 9, sleep_minutes: 480 }],
    });
    const row = plan.rows.find((item) => item.metric_date === "2026-05-29");
    expect(row?.status).toBe("conflict");
    expect(row?.writeValues).toEqual({});
    expect(plan.report.fieldCounts.running_distance_km.conflict).toBe(1);
  });

  it("does not derive a pace when distance and duration come from different sessions", () => {
    const distanceOnly = takeoutExercise({
      source_record_id: "takeout-distance-only",
      end_time: null,
      measured_at: null,
      payload: { source: { provider: "google_takeout" }, exercise: { exerciseType: "JOGGING", metricsSummary: { distanceMillimeters: 5_000_000 } } },
    });
    const durationOnly = takeoutExercise({
      source_record_id: "takeout-duration-only",
      start_time: "2026-05-29T18:00:00+02:00",
      end_time: "2026-05-29T18:18:00+02:00",
      measured_at: "2026-05-29T18:18:00+02:00",
      payload: { source: { provider: "google_takeout" }, exercise: { exerciseType: "JOGGING", metricsSummary: {} } },
    });
    const plan = buildPlan({ candidates: [distanceOnly, durationOnly], existingMetrics: [] });
    const row = plan.rows.find((item) => item.metric_date === "2026-05-29");
    expect(row?.derived.running_distance_km).toBe(5);
    expect(row?.derived.running_duration_minutes).toBe(18);
    expect(row?.derived.running_pace_seconds_per_km).toBeNull();
  });

  it("enforces the WHOOP/Takeout boundary and parses D1 wrappers", () => {
    const whoopLate = exercise({ civil_date: "2026-05-29", source_record_id: "whoop-late" });
    const takeoutEarly = takeoutExercise({ civil_date: "2026-05-28", source_record_id: "takeout-early" });
    const plan = buildPlan({ candidates: [whoopLate, takeoutEarly], existingMetrics: [] });
    expect(plan.report.statusCounts.outside_cutoff).toBe(2);
    const rows = parseRowsText(JSON.stringify({ results: [{ table_name: "daily_health_metrics", user_id: userId, json_data: JSON.stringify({ user_id: userId, metric_date: "2026-05-29", sleep_minutes: 480 }) }] }), "daily_health_metrics");
    expect(rows).toEqual([{ user_id: userId, metric_date: "2026-05-29", sleep_minutes: 480 }]);
  });

  it("rejects API candidates and requires an identifiable user", () => {
    const apiCandidate = takeoutExercise({
      recording_method: "AUTOMATIC",
      source_device: "Pixel Watch",
      payload: { exercise: { exerciseType: "JOGGING", metricsSummary: { distanceMillimeters: 5_000_000 } } },
    });
    const plan = buildPlan({ candidates: [apiCandidate], existingMetrics: [], userId });
    expect(plan.report.statusCounts.invalid).toBe(1);
    expect(() => buildPlan({ candidates: [{ ...takeoutExercise(), user_id: undefined }], existingMetrics: [] })).toThrow("user_id");
  });

  it("does not derive a zero pace from a zero-duration run", () => {
    const zeroDuration = takeoutExercise({ end_time: "2026-05-29T10:00:00+02:00" });
    const plan = buildPlan({ candidates: [zeroDuration], existingMetrics: [] });
    const row = plan.rows.find((item) => item.metric_date === "2026-05-29");
    expect(row?.derived.running_distance_km).toBe(5);
    expect(row?.derived.running_pace_seconds_per_km).toBeNull();
  });

  it("generates only targeted json_set updates and no-op-safe conflict handling", () => {
    const plan = buildPlan({ candidates: [takeoutExercise()], existingMetrics: [{ user_id: userId, metric_date: "2026-05-29", sleep_minutes: 480 }] });
    const generated = buildSql(plan, { generateSql: true, now: "2026-08-28T10:00:00.000Z" });
    expect(generated.sqlRows).toBe(1);
    expect(generated.sql).toContain("json_set(soma_rows.json_data");
    expect(generated.sql).toContain("ON CONFLICT(table_name,row_key) DO UPDATE");
    expect(generated.sql).toContain("'$.running_distance_km'");
    expect(generated.sql).not.toContain("'$.sleep_minutes'");
    expect(generated.sql).not.toContain("'$.steps'");
    expect(generated.sql).toContain("WHERE (json_extract(soma_rows.json_data, '$.running_distance_km') IS NULL)");
  });
});
