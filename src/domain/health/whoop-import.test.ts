import { describe, expect, it } from "vitest";

import { validateWhoopImportBatch } from "./whoop-import";

const record = {
  provider: "whoop_export",
  data_type: "daily-exercise-summary",
  source_record_id: "whoop-export:v1:daily-exercise-summary:2026-05-28",
  start_time: null,
  end_time: null,
  civil_date: "2026-05-28",
  recording_method: "DERIVED",
  source_device: "WHOOP",
  payload: { dailyExerciseSummary: { minutes: 60 } },
  measured_at: "2026-05-28T07:00:00+02:00",
};

describe("WHOOP import validation", () => {
  it("accepts a normalized record", () => {
    expect(validateWhoopImportBatch([record])).toEqual([record]);
  });

  it("removes fields outside the import contract", () => {
    expect(validateWhoopImportBatch([{ ...record, user_id: "another-user" }])[0]).not.toHaveProperty("user_id");
  });

  it("rejects a source identifier that does not match the data type", () => {
    expect(() => validateWhoopImportBatch([{ ...record, data_type: "exercise" }])).toThrow("source identifier");
  });

  it("rejects oversized batches", () => {
    expect(() => validateWhoopImportBatch([record, record], 1)).toThrow("between 1 and 1");
  });
});
