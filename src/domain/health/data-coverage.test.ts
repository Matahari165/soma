import { describe, expect, it } from "vitest";

import { calculateHealthDataCoverage, type ImportedHealthDate } from "./data-coverage";

function record(dataType: string, date: string | null, timestamps: Partial<ImportedHealthDate> = {}): ImportedHealthDate {
  return {
    data_type: dataType,
    civil_date: date,
    start_time: null,
    end_time: null,
    measured_at: null,
    ...timestamps,
  };
}

describe("health data coverage", () => {
  it("counts distinct imported dates and the dates represented in analysis", () => {
    const coverage = calculateHealthDataCoverage({
      imported: [
        record("steps", "2026-08-20"),
        record("daily-resting-heart-rate", "2026-08-20"),
        record("sleep", "2026-08-20"),
        record("steps", "2026-08-21"),
        record("sleep", "2026-08-21"),
      ],
      used: [
        { metric_date: "2026-08-20", sleep_minutes: 470 },
        { metric_date: "2026-08-21", sleep_minutes: null },
      ],
      timeZone: "Europe/Paris",
    });

    expect(coverage).toMatchObject({
      status: "incomplete",
      importedDays: 2,
      usedDays: 2,
      importedNights: 2,
      usedNights: 1,
      missingDays: 0,
      missingNights: 1,
      startDate: "2026-08-20",
      endDate: "2026-08-21",
    });
  });

  it("uses timestamps when Google does not provide a civil date", () => {
    const coverage = calculateHealthDataCoverage({
      imported: [record("sleep", null, { end_time: "2026-08-21T22:30:00.000Z" })],
      used: [{ metric_date: "2026-08-22", sleep_minutes: 480 }],
      timeZone: "Europe/Paris",
    });

    expect(coverage.status).toBe("complete");
    expect(coverage.startDate).toBe("2026-08-22");
    expect(coverage.usedNights).toBe(1);
  });

  it("reports an explicit limited state when the safety bound is reached", () => {
    const coverage = calculateHealthDataCoverage({
      imported: [record("steps", "2026-08-20")],
      used: [{ metric_date: "2026-08-20", sleep_minutes: null }],
      timeZone: "Europe/Paris",
      limited: true,
    });

    expect(coverage.status).toBe("limited");
  });
});
