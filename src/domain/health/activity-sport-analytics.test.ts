import { describe, expect, it } from "vitest";

import type { ExerciseSummary } from "@/services/health-analytics";

import {
  ACTIVITY_SESSION_METRICS,
  activityFilterForType,
  activityFilterLabel,
  activityMetricAverage,
  activityMetricPoints,
  activityRegularity,
  activityVolumeAverage,
  activityVolumePoints,
  runningWeekSummary,
} from "./activity-sport-analytics";

function exercise(overrides: Partial<ExerciseSummary> & Pick<ExerciseSummary, "id" | "date" | "type">): ExerciseSummary {
  return {
    name: overrides.id,
    durationMinutes: null,
    activeMinutes: null,
    calories: null,
    distanceKm: null,
    averageHeartRate: null,
    maximumHeartRate: null,
    zoneMinutes: null,
    averageSpeedKph: null,
    averagePaceSecondsPerKm: null,
    elevationGainMeters: null,
    steps: null,
    runVo2Max: null,
    swimLengths: null,
    cadence: null,
    strideLengthMeters: null,
    groundContactMilliseconds: null,
    verticalOscillationMillimeters: null,
    verticalRatio: null,
    ...overrides,
  };
}

describe("activity sport analytics", () => {
  it("keeps known aliases together and makes unknown source types filterable", () => {
    expect(activityFilterForType("trail-running")).toBe("run");
    expect(activityFilterForType("treadmill")).toBe("run");
    expect(activityFilterForType("muay-thai")).toBe("boxing");
    expect(activityFilterForType("PILATES")).toBe("other:PILATES");
    expect(activityFilterLabel("other:PILATES")).toBe("Pilates");
  });

  it("keeps each workout as a separate dated metric point, including sessions on one date", () => {
    const definition = ACTIVITY_SESSION_METRICS.find((metric) => metric.key === "distanceKm")!;
    const points = activityMetricPoints([
      exercise({ id: "Morning", date: "2026-09-21", type: "RUNNING", startTime: "2026-09-21T06:30:00.000Z", distanceKm: 4 }),
      exercise({ id: "Evening", date: "2026-09-21", type: "RUNNING", startTime: "2026-09-21T16:15:00.000Z", distanceKm: 6 }),
    ], definition, "Europe/Paris");

    expect(points).toHaveLength(2);
    expect(points.map((point) => point.value)).toEqual([4, 6]);
    expect(points.map((point) => point.label)).toEqual(["2026-09-21 · 08:30 AM", "2026-09-21 · 06:15 PM"]);
  });

  it("calculates a 30-day metric average from measured session values only", () => {
    const definition = ACTIVITY_SESSION_METRICS.find((metric) => metric.key === "distanceKm")!;
    const result = activityMetricAverage([
      exercise({ id: "A", date: "2026-09-01", type: "RUNNING", distanceKm: 4 }),
      exercise({ id: "B", date: "2026-09-21", type: "RUNNING", distanceKm: 6 }),
      exercise({ id: "C", date: "2026-09-21", type: "RUNNING", distanceKm: null }),
      exercise({ id: "Outside", date: "2026-08-22", type: "RUNNING", distanceKm: 100 }),
    ], definition, "2026-09-21");

    expect(result).toEqual({ value: 5, sampleSize: 2 });
  });

  it("keeps counts separate from missing duration totals in weekly and monthly buckets", () => {
    const sessions = [
      exercise({ id: "A", date: "2026-09-15", type: "RUNNING", durationMinutes: 30 }),
      exercise({ id: "B", date: "2026-09-15", type: "RUNNING", durationMinutes: null }),
      exercise({ id: "C", date: "2026-09-21", type: "RUNNING", durationMinutes: 45 }),
    ];
    const weeklyCounts = activityVolumePoints(sessions, "2026-09-21", 14, "week", "sessions");
    const weeklyDurations = activityVolumePoints(sessions, "2026-09-21", 14, "week", "durationMinutes");
    const monthlyCounts = activityVolumePoints(sessions, "2026-09-21", 30, "month", "sessions");

    expect(weeklyCounts.map((point) => point.value)).toEqual([0, 2, 1]);
    expect(weeklyCounts.map((point) => point.date)).toEqual(["2026-09-08", "2026-09-14", "2026-09-21"]);
    expect(weeklyDurations.map((point) => point.value)).toEqual([null, null, 45]);
    expect(monthlyCounts.reduce((total, point) => total + (point.value ?? 0), 0)).toBe(3);
    expect(activityVolumeAverage(sessions, "2026-09-21", "week", "durationMinutes")).toEqual({ value: null, sampleSize: 2 });
  });

  it("compares regularity against the previous 30-day window", () => {
    const result = activityRegularity([
      exercise({ id: "old-1", date: "2026-07-24", type: "RUNNING" }),
      exercise({ id: "old-2", date: "2026-08-11", type: "RUNNING" }),
      exercise({ id: "new-1", date: "2026-09-03", type: "RUNNING" }),
      exercise({ id: "new-2", date: "2026-09-13", type: "RUNNING" }),
      exercise({ id: "new-3", date: "2026-09-15", type: "RUNNING" }),
    ], "2026-09-21");

    expect(result).toEqual({ activeWeeks: 3, totalWeeks: 6, percent: 50, previousPercent: 40, deltaPoints: 10 });
  });

  it("keeps regularity unavailable when no current-window workouts were imported", () => {
    const result = activityRegularity([
      exercise({ id: "old", date: "2026-08-01", type: "RUNNING" }),
    ], "2026-09-21");

    expect(result).toEqual({ activeWeeks: 0, totalWeeks: 6, percent: null, previousPercent: 20, deltaPoints: null });
  });

  it("does not invent an increase when the previous window has no imported workouts", () => {
    const result = activityRegularity([
      exercise({ id: "older", date: "2026-07-01", type: "RUNNING" }),
      exercise({ id: "current", date: "2026-09-03", type: "RUNNING" }),
    ], "2026-09-21");

    expect(result).toMatchObject({ activeWeeks: 1, percent: 17, previousPercent: null, deltaPoints: null });
  });
});


describe("running week summary", () => {
  it("starts on Monday in the profile timezone, excludes other sports and future days, and counts each session once", () => {
    const runs = [
      exercise({id: "monday", date: "2026-09-20", startTime: "2026-09-20T22:30:00Z", type: "RUN", durationMinutes: 30.5}),
      exercise({id: "sunday", date: "2026-09-21", startTime: "2026-09-20T21:30:00Z", type: "RUNNING", durationMinutes: 80}),
      exercise({id: "trail", date: "2026-09-25", type: "TRAIL_RUNNING", durationMinutes: 40}),
      exercise({id: "trail", date: "2026-09-25", type: "TRAIL_RUNNING", durationMinutes: 40}),
      exercise({id: "walk", date: "2026-09-25", type: "WALKING", durationMinutes: 60}),
      exercise({id: "future", date: "2026-09-27", type: "RUNNING", durationMinutes: 60}),
    ];
    expect(runningWeekSummary(runs, "2026-09-26", "Europe/Paris")).toEqual({startDate: "2026-09-21", sessions: 2, minutes: 70.5, missingDurations: 0});
  });
  it("resets on Monday across years and does not replace missing duration with zero", () => {
    const runs = [exercise({id: "old", date: "2025-12-28", type: "RUNNING", durationMinutes: 80}), exercise({id: "new", date: "2025-12-29", type: "RUNNING"})];
    expect(runningWeekSummary(runs, "2026-01-01", "UTC")).toEqual({startDate: "2025-12-29", sessions: 1, minutes: null, missingDurations: 1});
    expect(runningWeekSummary([], "2026-01-05", "UTC")).toEqual({startDate: "2026-01-05", sessions: 0, minutes: 0, missingDurations: 0});
  });
  it("preserves a known subtotal when another session has no valid duration", () => {
    expect(runningWeekSummary([exercise({id: "known", date: "2026-09-21", type: "RUNNING", durationMinutes: 20}), exercise({id: "missing", date: "2026-09-22", type: "RUNNING", durationMinutes: NaN})], "2026-09-26", "UTC")).toMatchObject({sessions: 2, minutes: 20, missingDurations: 1});
  });
});
