import { afterEach, describe, expect, it, vi } from "vitest";

import { daysUntilFirstResult, groupOutcomeThemes, influenceExplanation, matrixCellEffectText, matrixCellState, matrixScrollBehavior, matrixTimingLabel, periodLabel } from "./correlation-matrix";
import { calculateMatrixRelation, type MatrixRelation, type MatrixSeries } from "@/domain/lab/matrix";

describe("relationship matrix motion helpers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("formats the four analysis period labels", () => {
    expect(periodLabel(15)).toBe("15d");
    expect(periodLabel(30)).toBe("30d");
    expect(periodLabel(90)).toBe("90d");
    expect(periodLabel("all")).toBe("All");
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

  it("explains the newly enabled health and Soma indicators", () => {
    expect(influenceExplanation("sedentary_minutes", "Sedentary minutes")).toMatchObject({
      definition: expect.stringContaining("sedentary"),
      calculation: expect.stringContaining("sedentary-minute"),
      source: "Google Health",
    });
    expect(influenceExplanation("active_day", "Active day")).toMatchObject({
      definition: expect.stringContaining("yes or no"),
      source: "Soma",
      sourceDetail: expect.stringContaining("Google Health"),
    });
    expect(influenceExplanation("running_distance", "Running distance")).toMatchObject({
      definition: expect.stringContaining("running"),
      calculation: expect.stringContaining("kilometres"),
      source: "Google Health",
    });
    expect(influenceExplanation("running_pace", "Running pace")).toMatchObject({
      calculation: expect.stringContaining("seconds per kilometre"),
      source: "Google Health",
    });
    expect(influenceExplanation("running_average_heart_rate", "Running average heart rate")).toMatchObject({
      calculation: expect.stringContaining("beats per minute"),
      source: "Google Health",
    });
    expect(influenceExplanation("vo2_max", "VO₂ max")).toMatchObject({
      definition: expect.stringContaining("oxygen"),
      source: "Google Health",
    });
  });
});
