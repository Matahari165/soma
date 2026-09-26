import { describe, expect, it } from "vitest";
import { strengthMinutesForDate } from "./strength-minutes";
import type { NormalizedHealthRecord } from "./aggregate";

const session = (type: string, start = "2026-09-26T10:00:00Z", end = "2026-09-26T10:10:00Z"): NormalizedHealthRecord => ({ data_type: "exercise", civil_date: "2026-09-26", start_time: start, end_time: end, measured_at: end, payload: { exercise: { exerciseType: type } } });
describe("daily strengthening minutes", () => {
  it("counts strengthening while excluding walks and generic gym activities", () => {
    expect(strengthMinutesForDate([session("WEIGHT_TRAINING"), session("WALKING"), session("GYM")], "2026-09-26", "UTC", 30)).toBe(10);
  });
  it("unions duplicate and overlapping sessions", () => {
    const exercise = session("STRENGTH_TRAINING");
    expect(strengthMinutesForDate([exercise, exercise, session("CALISTHENICS", "2026-09-26T10:05:00Z", "2026-09-26T10:15:00Z")], "2026-09-26", "UTC", 30)).toBe(15);
  });
  it("clips sessions across local midnight", () => {
    const exercise = session("WEIGHT_TRAINING", "2026-09-25T21:55:00Z", "2026-09-25T22:05:00Z");
    expect(strengthMinutesForDate([exercise], "2026-09-26", "Europe/Paris", 10)).toBe(5);
  });
  it("clips fractional minutes precisely at midnight", () => {
    const exercise = session("WEIGHT_TRAINING", "2026-09-25T23:59:30Z", "2026-09-26T00:00:30Z");
    expect(strengthMinutesForDate([exercise], "2026-09-26", "UTC", 1)).toBe(0.5);
  });
  it("distinguishes no recorded strengthening from missing exercise measurements", () => {
    expect(strengthMinutesForDate([], "2026-09-26", "UTC", null)).toBeNull();
    expect(strengthMinutesForDate([], "2026-09-26", "UTC", 0)).toBe(0);
  });
});
