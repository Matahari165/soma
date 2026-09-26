import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ActivityHistory, activityAverages, displayedActivities, exerciseIsInPeriod, exerciseMatchesFilter } from "./activity-history";

describe("activity history filters", () => {
  it("removes closed period options from the accessibility tree", () => {
    const markup = renderToStaticMarkup(createElement(ActivityHistory, { exercises: [], referenceDate: "2026-09-21" }));

    expect(markup).toContain('aria-expanded="false" aria-controls="activity-period-options"');
    expect(markup).toContain('aria-hidden="true" inert=""');
  });

  it("groups imported jogging and trail running under Run", () => {
    expect(exerciseMatchesFilter("JOGGING", "run")).toBe(true);
    expect(exerciseMatchesFilter("TRAIL_RUNNING", "run")).toBe(true);
    expect(exerciseMatchesFilter("TRAIL_RUN", "run")).toBe(true);
    expect(exerciseMatchesFilter("TREADMILL", "run")).toBe(true);
    expect(exerciseMatchesFilter("BOXING", "run")).toBe(false);
  });

  it("keeps both strength aliases and never hides an unknown type from All", () => {
    expect(exerciseMatchesFilter("WEIGHT_TRAINING", "strength")).toBe(true);
    expect(exerciseMatchesFilter("STRENGTH_TRAINING", "strength")).toBe(true);
    expect(exerciseMatchesFilter("UNKNOWN", "all")).toBe(true);
  });

  it("recognizes Google Health boxing and weight training types", () => {
    for (const type of ["BOXING", "KICKBOXING", "MUAY_THAI"]) expect(exerciseMatchesFilter(type, "boxing")).toBe(true);
    for (const type of ["WEIGHTLIFTING", "WEIGHTS", "FREE_WEIGHTS", "WEIGHT_MACHINES", "POWERLIFTING", "FUNCTIONAL_STRENGTH_TRAINING"]) expect(exerciseMatchesFilter(type, "strength")).toBe(true);
    expect(exerciseMatchesFilter("BOXING", "strength")).toBe(false);
  });

  it("uses inclusive rolling period boundaries", () => {
    expect(exerciseIsInPeriod("2026-09-15", "2026-09-21", 7)).toBe(true);
    expect(exerciseIsInPeriod("2026-09-14", "2026-09-21", 7)).toBe(false);
    expect(exerciseIsInPeriod("2026-09-21", "2026-09-21", 7)).toBe(true);
    expect(exerciseIsInPeriod("2026-09-22", "2026-09-21", 7)).toBe(false);
  });

  it("averages each available measure independently without turning missing data into zero", () => {
    const base = { id: "a", date: "2026-09-21", name: "Run", type: "RUNNING", durationMinutes: null, activeMinutes: null, zoneMinutes: null, averageSpeedKph: null, elevationGainMeters: null, steps: null, runVo2Max: null, swimLengths: null, cadence: null, strideLengthMeters: null, groundContactMilliseconds: null, verticalOscillationMillimeters: null, verticalRatio: null };
    const result = activityAverages([
      { ...base, durationMinutes: 0, distanceKm: 0, calories: 400, averageHeartRate: 140, maximumHeartRate: 170, averagePaceSecondsPerKm: 360 },
      { ...base, id: "b", durationMinutes: null, distanceKm: null, calories: 600, averageHeartRate: null, maximumHeartRate: 180, averagePaceSecondsPerKm: 420 },
    ]);
    expect(result).toEqual({ distanceKm: 0, durationMinutes: 0, calories: 500, averageHeartRate: 140, maximumHeartRate: 175, averagePaceSecondsPerKm: 390 });
  });

  it("shows only the first three recent workouts until a filter is used", () => {
    const exercises = ["2026-09-18", "2026-09-21", "2026-09-17", "2026-09-20", "2026-09-19"]
      .map((date, index) => ({ id: String(index), date })) as never[];
    expect(displayedActivities(exercises, false).map((exercise) => exercise.date)).toEqual(["2026-09-21", "2026-09-20", "2026-09-19"]);
    expect(displayedActivities(exercises, true)).toHaveLength(5);
  });
});
