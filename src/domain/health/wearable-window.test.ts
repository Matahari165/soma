import { describe, expect, it } from "vitest";

import { findWearableWindowStart, recordsInsideWearableWindow, type WearableDatedRecord } from "./wearable-window";

function record(dataType: string, date: string, sourceDevice: string | null, input: Partial<WearableDatedRecord> = {}): WearableDatedRecord {
  return {
    provider: input.provider,
    data_type: dataType,
    civil_date: date,
    start_time: null,
    end_time: null,
    measured_at: null,
    source_device: sourceDevice,
    payload: input.payload,
  };
}

describe("wearable data window", () => {
  it("starts with the first device-attributed core wearable measurement", () => {
    const records = [
      record("steps", "2026-01-09", null),
      record("sleep", "2026-02-25", null),
      record("daily-resting-heart-rate", "2026-05-29", "Google Fitbit Air"),
      record("sleep", "2026-05-30", "Google Fitbit Air"),
    ];

    expect(findWearableWindowStart(records, "Europe/Paris")).toBe("2026-05-29");
    expect(recordsInsideWearableWindow(records, "Europe/Paris").records.map((item) => item.civil_date)).toEqual([
      "2026-05-29",
      "2026-05-30",
    ]);
  });

  it("keeps all records when Google supplies no device attribution", () => {
    const records = [record("steps", "2026-01-09", null), record("sleep", "2026-02-25", null)];
    expect(recordsInsideWearableWindow(records, "Europe/Paris")).toEqual({ records, startDate: null });
  });

  it("uses WHOOP before Fitbit and removes the mirrored Google copy", () => {
    const whoopMirror = { dataSource: { application: { packageName: "com.whoop.iphone" } } };
    const records = [
      record("active-energy-burned", "2025-05-12", null),
      record("sleep", "2025-05-12", null, { payload: whoopMirror }),
      record("sleep", "2025-05-12", "WHOOP", { provider: "whoop_export" }),
      record("daily-heart-rate-variability", "2025-05-12", "WHOOP", { provider: "whoop_export" }),
      record("steps", "2026-05-28", null),
      record("daily-resting-heart-rate", "2026-05-29", "Google Fitbit Air"),
      record("steps", "2026-05-29", null),
      record("sleep", "2026-05-30", "Google Fitbit Air"),
    ];

    expect(recordsInsideWearableWindow(records, "Europe/Paris").records).toEqual([
      records[2],
      records[3],
      records[5],
      records[6],
      records[7],
    ]);
  });

  it("falls back to a mirrored WHOOP day when the export has no matching metric", () => {
    const mirror = record("daily-oxygen-saturation", "2026-05-12", null, {
      payload: { dataSource: { application: { packageName: "com.whoop.iphone" } } },
    });
    const records = [
      record("sleep", "2026-05-12", "WHOOP", { provider: "whoop_export" }),
      mirror,
      record("daily-resting-heart-rate", "2026-05-29", "Google Fitbit Air"),
    ];

    expect(recordsInsideWearableWindow(records, "Europe/Paris").records).toContain(mirror);
  });
});
