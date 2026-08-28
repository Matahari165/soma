import { describe, expect, it } from "vitest";

// The operational tool is intentionally a dependency-free Node module so it
// can be run without a Next.js server or Cloudflare credentials.
import { buildSql, compareRecords, parseRowsText, semanticRelation } from "../../scripts/compare-wearable-import.mjs";

const userId = "user-test";

function record(overrides: Record<string, unknown> = {}) {
  return {
    user_id: userId,
    provider: "google_health",
    data_type: "distance",
    source_record_id: "takeout-distance-1",
    civil_date: "2026-06-01",
    start_time: null,
    end_time: null,
    measured_at: "2026-06-01T12:00:00.000Z",
    recording_method: "TAKEOUT_VERIFIED",
    source_device: "Google Fitbit Air",
    payload: { source: { provider: "google_takeout" }, dailyRollup: { distanceMillimeters: 5_000_000 } },
    ...overrides,
  };
}

describe("compare-wearable-import", () => {
  it("accepts D1 wrapper exports without exposing record values in the report", () => {
    const rows = parseRowsText(JSON.stringify({ results: [{ json_data: JSON.stringify(record()) }] }));
    const candidate = { ...record() };
    delete (candidate as { user_id?: string }).user_id;
    const comparison = compareRecords({ candidates: [candidate], existing: rows });

    expect(comparison.report.counts.already_present_exact).toBe(1);
    expect(JSON.stringify(comparison.report)).not.toContain("5_000_000");
    expect(JSON.stringify(comparison.report)).not.toContain("takeout-distance-1");
  });

  it("classifies an exact source-id payload extension as enrichment", () => {
    const existing = record({ payload: { source: { provider: "google_takeout" }, exercise: { exerciseType: "JOGGING", metricsSummary: { averageHeartRateBeatsPerMinute: 150 } } }, data_type: "exercise", source_record_id: "takeout-exercise-1", measured_at: "2026-06-01T12:00:00.000Z" });
    const candidate = record({ payload: { source: { provider: "google_takeout" }, exercise: { exerciseType: "JOGGING", metricsSummary: { averageHeartRateBeatsPerMinute: 150, distanceMillimeters: 5_000_000 } } }, data_type: "exercise", source_record_id: "takeout-exercise-1", measured_at: "2026-06-01T12:00:00.000Z" });
    const comparison = compareRecords({ candidates: [candidate], existing: [existing] });

    expect(comparison.report.counts.enrichment).toBe(1);
    const generated = buildSql(comparison, { generateSql: true, now: "2026-08-28T10:00:00.000Z" });
    expect(generated.sqlRecords).toBe(1);
    expect(generated.sql).toContain("ON CONFLICT(table_name, row_key) DO UPDATE");
  });

  it("detects semantic duplicates across source identifiers and VO2 data types", () => {
    const existingDistance = record({ source_record_id: "api-distance-1", payload: { dailyRollup: { distanceMillimeters: 5_000_500 } } });
    const candidateDistance = record({ source_record_id: "takeout-distance-2", payload: { dailyRollup: { distanceMillimeters: 5_000_000 } } });
    const existingVo2 = record({ data_type: "vo2-max", source_record_id: "api-vo2-1", measured_at: "2026-06-01T10:15:00.000Z", payload: { vo2Max: 51.44 } });
    const candidateVo2 = record({ data_type: "run-vo2-max", source_record_id: "takeout-vo2-1", measured_at: "2026-06-01T10:15:02.000Z", payload: { runVo2Max: 51.44 } });
    const comparison = compareRecords({ candidates: [candidateDistance, candidateVo2], existing: [existingDistance, existingVo2] });

    expect(comparison.report.counts.duplicate_semantic).toBe(2);
    expect(semanticRelation(candidateVo2, existingVo2)).toBe("equal");
  });

  it("keeps same-slot value changes as conflicts and enforces the source cutoffs", () => {
    const existing = record({ data_type: "daily-vo2-max", source_record_id: "api-daily-vo2", payload: { dailyVo2Max: 50 } });
    const changed = record({ data_type: "daily-vo2-max", source_record_id: "takeout-daily-vo2", payload: { dailyVo2Max: 52 } });
    const whoopAfterCutoff = {
      user_id: userId,
      provider: "whoop_export",
      data_type: "daily-resting-heart-rate",
      source_record_id: "whoop-late",
      civil_date: "2026-05-29",
      payload: {},
    };
    const takeoutBeforeCutoff = record({ civil_date: "2026-05-28", source_record_id: "takeout-early" });
    const comparison = compareRecords({ candidates: [changed, whoopAfterCutoff, takeoutBeforeCutoff], existing: [existing] });

    expect(comparison.report.counts.conflict).toBe(1);
    expect(comparison.report.counts.outside_cutoff).toBe(2);
  });

  it("does not generate SQL unless explicitly enabled and makes new inserts idempotent", () => {
    const comparison = compareRecords({ candidates: [record({ source_record_id: "new-distance" })], existing: [] });

    expect(() => buildSql(comparison)).toThrow("generateSql");
    const generated = buildSql(comparison, { generateSql: true, now: "2026-08-28T10:00:00.000Z" });
    expect(generated.sqlRecords).toBe(1);
    expect(generated.sql).toContain("ON CONFLICT(table_name, row_key) DO NOTHING");
    expect(generated.sql).not.toContain("BEGIN;");
    expect(generated.sql).not.toContain("COMMIT;");
  });
});
