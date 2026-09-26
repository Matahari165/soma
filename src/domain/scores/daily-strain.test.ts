import { calculateActiveHours } from "@/domain/health/active-hours";
import { describe, expect, it } from "vitest";
import { calculateDailyStrain, dailyStrainScoreFromRow } from "./effort";

const goals = { steps: 10_000, zoneMinutes: 45, strengthMinutes: 10, activeHoursProgress: 1 };
describe("daily Strain goals", () => {
  it("allows capped compensation with diminishing returns", () => {
    expect(calculateDailyStrain(goals).score).toBe(100);
    expect(calculateDailyStrain({ ...goals, steps: 50_000, zoneMinutes: 500, strengthMinutes: 0 }).score).toBe(100);
    expect(calculateDailyStrain({ ...goals, steps: 9_999 }).score).toBe(99);
  });
  it("credits excess at sixty percent and caps each sporting contribution at 45", () => {
    expect(calculateDailyStrain({ steps: 15_000, zoneMinutes: 45, strengthMinutes: 10, activeHoursProgress: 0 }).score).toBe(99);
    expect(calculateDailyStrain({ steps: 100_000, zoneMinutes: 0, strengthMinutes: 0, activeHoursProgress: 0 }).score).toBe(45);
    expect(calculateDailyStrain({ steps: 10_000, zoneMinutes: 45, strengthMinutes: 15, activeHoursProgress: 0.1 }).score).toBe(100);
    expect(calculateDailyStrain({ steps: 0, zoneMinutes: 0, strengthMinutes: 0, activeHoursProgress: 2 }).score).toBe(10);
  });
  it("weights sports goals at thirty percent and hours at ten percent", () => {
    expect(calculateDailyStrain({ ...goals, steps: 0 }).score).toBe(70);
    expect(calculateDailyStrain({ steps: 5_000, zoneMinutes: 22.5, strengthMinutes: 5, activeHoursProgress: 0.5 }).score).toBe(50);
  });
  it("does not turn incomplete hourly coverage into zero or a perfect score", () => {
    expect(calculateDailyStrain({ ...goals, activeHoursProgress: null })).toMatchObject({ score: null, coverage: 0.75 });
    expect(calculateDailyStrain({ ...goals, activeHoursProgress: 0 }).score).toBe(90);
  });
  it("advances the hourly goal between imports and removes a stale perfect score", () => {
    const activeHours = calculateActiveHours({ date: "2030-01-02", timeZone: "UTC", now: "2030-01-02T08:45:00Z", records: [
      { data_type: "sleep", civil_date: null, start_time: "2030-01-02T00:00:00Z", end_time: "2030-01-02T08:00:00Z", measured_at: null, payload: {} },
      { data_type: "steps", civil_date: null, start_time: "2030-01-02T08:10:00Z", end_time: "2030-01-02T08:11:00Z", measured_at: null, payload: { steps: { interval: { startTime: "2030-01-02T08:10:00Z", endTime: "2030-01-02T08:11:00Z" }, count: 100 } } },
    ] });
    const row = { score: null, algorithm_version: "effort-v5", drivers: { strainMeasurements: goals, activeHours } };
    expect(dailyStrainScoreFromRow(row, new Date("2030-01-02T09:15:00Z"))).toBe(100);
    expect(dailyStrainScoreFromRow(row, new Date("2030-01-02T10:15:00Z"))).toBeNull();
  });
  it("does not label legacy scores as scores from the new goals", () => {
    expect(dailyStrainScoreFromRow({ score: 100, algorithm_version: "effort-v4" })).toBeNull();
    expect(dailyStrainScoreFromRow({ score: 100, algorithm_version: "effort-v5" })).toBeNull();
    expect(dailyStrainScoreFromRow({ score: 75, algorithm_version: "effort-v6" })).toBe(75);
  });
});
