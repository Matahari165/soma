import { describe, expect, it } from "vitest";

import { adjustMatrixRelations, calculateMatrixRelation, MINIMUM_DAILY_OBSERVATIONS, type MatrixSeries } from "./matrix";

function date(index: number) {
  const value = new Date("2025-01-01T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + index);
  return value.toISOString().slice(0, 10);
}

function series(id: string, values: Array<number | null>, kind: MatrixSeries["kind"] = "numeric", segments?: string[]): MatrixSeries {
  return {
    id,
    label: id,
    unit: id === "hrv" ? "ms" : "min",
    kind,
    points: values.flatMap((value, index) => value === null ? [] : [{ date: date(index), value, segment: segments?.[index] }]),
  };
}

describe("Personal Lab dynamic models", () => {
  it("requires 15 adjusted daily pairs and keeps missing values absent", () => {
    const values = Array.from({ length: MINIMUM_DAILY_OBSERVATIONS }, (_, index) => index + 1);
    const relation = calculateMatrixRelation(series("activity", values), series("hrv", values));
    expect(relation.sampleSize).toBe(MINIMUM_DAILY_OBSERVATIONS);
    expect(relation.coefficient).toBeNull();
    expect(relation.evidence).toBe("insufficient");

    const withMissing = calculateMatrixRelation(
      series("journal", [...Array(20).fill(null), ...Array(25).fill(1)]),
      series("hrv", Array.from({ length: 45 }, (_, index) => 50 + index % 4)),
    );
    expect(withMissing.sampleSize).toBe(25);
  });

  it("reports a real-unit yes-versus-no adjusted effect", () => {
    const pattern = [0, 0, 1, 0, 1, 1, 0, 1];
    const exposure = Array.from({ length: 80 }, (_, index) => pattern[index % pattern.length]);
    const outcome = exposure.map((value, index) => 61 - 5 * value + Math.sin(index / 3));
    const relation = calculateMatrixRelation(series("ran", exposure, "binary"), series("hrv", outcome));
    expect(relation.method).toBe("adjusted-dynamic-regression");
    expect(relation.effect).toBeCloseTo(-5, 0);
    expect(relation.effectConfidenceHigh).toBeLessThan(0);
  });

  it("removes a shared time trend instead of creating a featured relationship", () => {
    const predictor = Array.from({ length: 160 }, (_, index) => index + 2 * Math.sin(index * 1.7));
    const outcome = Array.from({ length: 160 }, (_, index) => 40 + index * 0.7 + 3 * Math.cos(index * 1.31));
    const relation = calculateMatrixRelation(series("steps", predictor), series("hrv", outcome), 0, { minimumMeaningfulEffect: 1 });
    expect(Math.abs(relation.coefficient ?? 0)).toBeLessThan(0.25);
    expect(relation.featureEligible).toBe(false);
  });

  it("recovers a J+1 effect despite serial dependence", () => {
    const exposure = Array.from({ length: 180 }, (_, index) => 20 + 8 * Math.sin(index * 1.17) + (index % 5));
    const outcome = Array.from({ length: 180 }, (_, index) => 55 - 0.6 * (exposure[index - 1] ?? exposure[0]) + 2 * Math.sin(index / 9));
    const nextDay = calculateMatrixRelation(series("intense", exposure), series("hrv", outcome), 1);
    const twoDays = calculateMatrixRelation(series("intense", exposure), series("hrv", outcome), 2);
    expect(nextDay.effect).toBeLessThan(-4);
    expect(nextDay.pValue).toBeLessThan(0.05);
    expect(Math.abs(nextDay.effect ?? 0)).toBeGreaterThan(Math.abs(twoDays.effect ?? 0));
  });

  it("pools WHOOP and Fitbit into one adjusted longitudinal estimate", () => {
    const segments = Array.from({ length: 120 }, (_, index) => index < 60 ? "WHOOP" : "Fitbit");
    const predictor = Array.from({ length: 120 }, (_, index) => index % 20);
    const outcome = predictor.map((value, index) => index < 60 ? 40 + value : 80 - value);
    const relation = calculateMatrixRelation(series("load", predictor, "numeric", segments), series("hrv", outcome, "numeric", segments));
    expect(relation.sourceEstimates).toHaveLength(1);
    expect(relation.sourceEstimates[0].source).toBe("WHOOP + Fitbit");
    expect(relation.sourceEstimates[0].sampleSize).toBe(118);
    expect(relation.coverageBySource).toEqual([
      { source: "WHOOP", pairedDays: 60, pairedWeeks: 0 },
      { source: "Fitbit", pairedDays: 60, pairedWeeks: 0 },
    ]);
    expect(relation.coefficient).not.toBeNull();
    expect(relation.featureEligible).toBe(false);
  });

  it("does not interpret a wearable level shift as an association", () => {
    const segments = Array.from({ length: 120 }, (_, index) => index < 60 ? "WHOOP" : "Fitbit");
    const predictor = Array.from({ length: 120 }, (_, index) => (index % 12) + (index < 60 ? 0 : 100));
    const outcome = Array.from({ length: 120 }, (_, index) => 50 + Math.sin(index * 1.4) + (index < 60 ? 70 : 0));
    const relation = calculateMatrixRelation(series("steps", predictor, "numeric", segments), series("hrv", outcome, "numeric", segments));
    expect(relation.sourceEstimates).toHaveLength(1);
    expect(relation.sourceEstimates[0].source).toBe("WHOOP + Fitbit");
    expect(Math.abs(relation.coefficient ?? 0)).toBeLessThan(0.3);
    expect(relation.featureEligible).toBe(false);
  });

  it("keeps a 12-week Fitbit signal visible but ineligible for a highlight", () => {
    const weeklySeries = (id: string, values: number[]): MatrixSeries => ({
      id,
      label: id,
      unit: id === "hrv" ? "ms" : "steps",
      kind: "numeric",
      points: values.map((value, index) => ({ date: date(index * 7), value, segment: "Fitbit" })),
    });
    const steps = Array.from({ length: 12 }, (_, index) => 5_000 + index * 350 + Math.sin(index) * 500);
    const hrv = steps.map((value, index) => 42 + value / 2_000 + Math.cos(index * 1.7));
    const relation = calculateMatrixRelation(weeklySeries("steps", steps), weeklySeries("hrv", hrv), 0, { grain: "week", timeScale: "chronic" });
    expect(relation.coverageBySource).toEqual([{ source: "Fitbit", pairedDays: 0, pairedWeeks: 12 }]);
    expect(relation.effect).not.toBeNull();
    expect(relation.featureEligible).toBe(false);
    expect(relation.exclusionReasons).toContain("20 paired weeks required for a highlight");
  });

  it("applies Benjamini-Hochberg correction within the supplied family", () => {
    const x = Array.from({ length: 80 }, (_, index) => Math.sin(index * 1.27) * 10 + index % 4);
    const relations = [0.8, 0.45, 0.05].map((slope, relationIndex) => calculateMatrixRelation(
      series(`x-${relationIndex}`, x),
      series("hrv", x.map((value, index) => 50 + slope * value + Math.sin(index * (1.11 + relationIndex)))),
    ));
    const adjusted = adjustMatrixRelations(relations);
    expect(adjusted.every((relation) => relation.qValue >= relation.pValue)).toBe(true);
  });
});
