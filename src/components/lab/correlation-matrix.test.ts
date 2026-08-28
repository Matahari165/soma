import { afterEach, describe, expect, it, vi } from "vitest";

import { daysUntilFirstResult, defaultAnalysisPeriod, formatComparisonLabel, formatDuration, groupOutcomeThemes, influenceExplanation, matrixCellEffectText, matrixCellState, matrixScrollBehavior, matrixTimingLabel, periodLabel, publishedRelationsForPair } from "./correlation-matrix";
import { calculateMatrixRelation, type MatrixRelation, type MatrixSeries } from "@/domain/lab/matrix";

describe("relationship matrix motion helpers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("formats the four analysis period labels", () => {
    expect(periodLabel(15)).toBe("15d");
    expect(periodLabel(30)).toBe("30d");
    expect(periodLabel(90)).toBe("90d");
    expect(periodLabel("all")).toBe("All");
  });

  it("defaults Personal Lab to the 90-day window when available", () => {
    expect(defaultAnalysisPeriod([15, 30, 90, "all"])).toBe(90);
    expect(defaultAnalysisPeriod([15, 30])).toBe(15);
  });

  it("formats long minute comparisons as hours without changing short values", () => {
    expect(formatDuration(120)).toBe("120 min");
    expect(formatDuration(540)).toBe("9 h");
    expect(formatDuration(676)).toBe("11 h 16 min");
    expect(formatComparisonLabel("adverse zone 540 min–676 min · J+1")).toBe("adverse zone 9 h–11 h 16 min · J+1");
    expect(formatComparisonLabel("+200 min")).toBe("+3 h 20 min");
  });

  it("groups consecutive outcomes into readable themes", () => {
    expect(groupOutcomeThemes([
      { id: "sleep_minutes", label: "Sleep duration", unit: "min", direction: "target" },
      { id: "sleep_efficiency", label: "Sleep efficiency", unit: "%", direction: "higher" },
      { id: "hrv", label: "HRV", unit: "ms", direction: "higher" },
      { id: "rhr", label: "Resting heart rate", unit: "bpm", direction: "lower" },
      { id: "respiratory", label: "Respiratory rate", unit: "/min", direction: "target" },
    ])).toEqual([
      { label: "Sleep", count: 2 },
      { label: "Cardio & recovery", count: 2 },
      { label: "Breathing & oxygen", count: 1 },
    ]);
  });

  it("uses an instant scroll when reduced motion is enabled", () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
    });

    expect(matrixScrollBehavior()).toBe("auto");
  });

  it("keeps smooth scrolling available when motion is allowed", () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    });

    expect(matrixScrollBehavior()).toBe("smooth");
  });

  it("only labels delayed matrix relationships", () => {
    expect(matrixTimingLabel(0)).toBeNull();
    expect(matrixTimingLabel(1)).toBe("J+1");
    expect(matrixTimingLabel(2)).toBe("J+2");
  });

  it("opens only currently published relations from a summary finding", () => {
    const dates = Array.from({ length: 80 }, (_, index) => {
      const value = new Date("2026-01-01T12:00:00Z");
      value.setUTCDate(value.getUTCDate() + index);
      return value.toISOString().slice(0, 10);
    });
    const base = calculateMatrixRelation(
      { id: "bedtime", label: "Bedtime", unit: "min", kind: "numeric", points: dates.map((date, index) => ({ date, value: 1320 + index })) },
      { id: "hrv", label: "HRV", unit: "ms", kind: "numeric", points: dates.map((date, index) => ({ date, value: 50 + index })) },
    );
    const published = { ...base, featureEligible: true, practicallyMeaningful: true, excluded: false, qValue: .01 };
    const stale = { ...published, lagDays: 1, qValue: .2 };
    expect(publishedRelationsForPair([published, stale], published)).toEqual([published]);
  });

  it("shows the absolute effect when a relative percentage is unavailable", () => {
    expect(matrixCellEffectText({ outcomeUnit: "pts", effect: -9, percentEffect: null } as never)).toBe("-9.0 pts");
  });

  it("counts paired journal days still needed for a first numeric result", () => {
    const points = (count: number, multiplier: number): MatrixSeries["points"] => Array.from({ length: count }, (_, index) => ({
      date: `2026-08-${String(index + 1).padStart(2, "0")}`,
      value: index * multiplier,
    }));
    const relation = calculateMatrixRelation(
      { id: "journal:reading", label: "Reading", unit: "min", kind: "numeric", points: points(6, 1) },
      { id: "hrv", label: "HRV", unit: "ms", kind: "numeric", points: points(6, 2) },
    );
    expect(daysUntilFirstResult([relation])).toBe(4);
    expect(matrixCellState([relation], [])).toBe("collecting");
  });

  it("distinguishes no-signal, excluded and displayed cells", () => {
    const base = {
      excluded: false,
      coefficient: .2,
      minimumDaysRemaining: 0,
    } as MatrixRelation;
    expect(matrixCellState([base], [])).toBe("no-signal");
    expect(matrixCellState([{ ...base, excluded: true }], [])).toBe("excluded");
    expect(matrixCellState([base], [base])).toBeNull();
  });

  it("explains the indicator definition and provenance", () => {
    expect(influenceExplanation("exercise_minutes", "Exercise time")).toMatchObject({
      source: "Google Health",
      calculation: expect.stringContaining("daily exercise-minute"),
    });
    expect(influenceExplanation("sleep_regularity", "Sleep regularity")).toMatchObject({
      source: "Soma",
      sourceDetail: expect.stringContaining("Google Health"),
    });
    expect(influenceExplanation("journal:custom", "Evening reading")).toMatchObject({
      source: "Journal",
      sourceDetail: expect.stringContaining("Journal"),
    });
  });

  it("explains the selected running and activity metrics", () => {
    expect(influenceExplanation("running_distance", "Running distance")).toMatchObject({ source: "Google Health", calculation: expect.stringContaining("kilometres") });
    expect(influenceExplanation("running_pace", "Running pace")).toMatchObject({ source: "Google Health", calculation: expect.stringContaining("seconds per kilometre") });
    expect(influenceExplanation("running_average_heart_rate", "Running average heart rate")).toMatchObject({ source: "Google Health", calculation: expect.stringContaining("beats per minute") });
    expect(influenceExplanation("vo2_max", "VO₂ max")).toMatchObject({ source: "Google Health", definition: expect.stringContaining("oxygen") });
    expect(influenceExplanation("sedentary_minutes", "Sedentary minutes")).toMatchObject({ source: "Google Health", definition: expect.stringContaining("sedentary") });
    expect(influenceExplanation("active_day", "Active day")).toMatchObject({ source: "Soma", calculation: expect.stringContaining("7,500 steps") });
  });
});
