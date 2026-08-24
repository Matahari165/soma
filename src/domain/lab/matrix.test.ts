import { describe, expect, it } from "vitest";

import { adjustMatrixRelations, calculateMatrixRelation, type MatrixSeries } from "./matrix";

function date(index: number) {
  const value = new Date("2025-01-01T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + index);
  return value.toISOString().slice(0, 10);
}

function series(id: string, values: Array<number | null>, kind: MatrixSeries["kind"] = "numeric", presentation: MatrixSeries["presentation"] = "amount", segments?: string[]): MatrixSeries {
  return { id, label: id, unit: id === "hrv" ? "ms" : "min", kind, presentation, points: values.flatMap((value, index) => value === null ? [] : [{ date: date(index), value, segment: segments?.[index] }]) };
}

describe("Personal Lab raw within-person relations", () => {
  it("keeps missing values absent and requires ten numeric pairs", () => {
    const relation = calculateMatrixRelation(series("x", [...Array(12).fill(null), ...Array(9).keys()]), series("hrv", Array.from({ length: 21 }, (_, index) => 40 + index)));
    expect(relation.sampleSize).toBe(9);
    expect(relation.coefficient).toBeNull();
    expect(relation.evidence).toBe("insufficient");
  });

  it("reports a real-unit yes-versus-no effect with five days in each group", () => {
    const exposure = Array.from({ length: 80 }, (_, index) => index % 2);
    const outcome = exposure.map((value, index) => 61 - 5 * value + Math.sin(index / 3));
    const relation = calculateMatrixRelation(series("habit", exposure, "binary"), series("hrv", outcome));
    expect(relation.method).toBe("raw-within-person-hac");
    expect(relation.comparisonLabel).toBe("yes vs no");
    expect(relation.baselineCount).toBe(40);
    expect(relation.comparisonCount).toBe(40);
    expect(relation.effect).toBeCloseTo(-5, 0);
    expect(relation.effectConfidenceHigh).toBeLessThan(0);
  });

  it("uses the average positive dose versus zero for amounts", () => {
    const caffeine = Array.from({ length: 80 }, (_, index) => index % 2 ? 100 + index % 4 * 10 : 0);
    const sleep = caffeine.map((value, index) => 500 - value * .25 + Math.sin(index));
    const relation = calculateMatrixRelation(series("caffeine", caffeine), series("sleep", sleep));
    expect(relation.predictorLow).toBe(0);
    expect(relation.predictorHigh).toBeGreaterThan(100);
    expect(relation.comparisonLabel).toContain("avg vs 0");
    expect(relation.effect).toBeLessThan(-20);
    expect(relation.percentEffect).toBeLessThan(0);
  });

  it("translates clock-time relations into a 30-minute contrast", () => {
    const bedtime = Array.from({ length: 80 }, (_, index) => 1360 + index % 30);
    const recovery = bedtime.map((value, index) => 80 - (value - 1360) * .1 + Math.sin(index));
    const relation = calculateMatrixRelation(series("bedtime", bedtime, "numeric", "clock-time"), series("recovery", recovery));
    expect(relation.predictorDelta).toBe(30);
    expect(relation.comparisonLabel).toBe("30 min later");
    expect(relation.effect).toBeCloseTo(-3, 0);
  });

  it("reports a supported non-linear bedtime zone instead of forcing a slope", () => {
    const bedtime = Array.from({ length: 90 }, (_, index) => 1320 + index % 90);
    const recovery = bedtime.map((value, index) => 82 - Math.abs(value - 1365) * .18 + Math.sin(index * 1.7));
    const relation = calculateMatrixRelation(
      series("bedtime", bedtime, "numeric", "clock-time"),
      series("recovery", recovery),
      0,
      { outcomeDirection: "higher", minimumMeaningfulEffect: 1 },
    );
    expect(relation.comparisonLabel).toMatch(/^best zone \d{2}:\d{2}–\d{2}:\d{2}$/);
    expect(relation.comparisonMean).toBeGreaterThan(relation.baselineMean ?? 0);
  });

  it("keeps source coverage transparent and rejects cross-device pairs", () => {
    const segments = Array.from({ length: 40 }, (_, index) => index < 20 ? "WHOOP" : "Fitbit");
    const relation = calculateMatrixRelation(series("load", Array.from({ length: 40 }, (_, index) => index % 9), "numeric", "amount", segments), series("hrv", Array.from({ length: 40 }, (_, index) => 50 + index % 9), "numeric", "amount", segments));
    expect(relation.coverageBySource).toEqual([
      { source: "WHOOP", pairedDays: 20, pairedWeeks: 0 },
      { source: "Fitbit", pairedDays: 20, pairedWeeks: 0 },
    ]);
    expect(relation.sourceEstimates[0].source).toBe("WHOOP + Fitbit");
  });

  it("does not turn a wearable level shift into a relation", () => {
    const segments = Array.from({ length: 120 }, (_, index) => index < 60 ? "WHOOP" : "Fitbit");
    const predictor = Array.from({ length: 120 }, (_, index) => index % 12 + (index < 60 ? 0 : 100));
    const outcome = Array.from({ length: 120 }, (_, index) => 50 + Math.sin(index * 1.4) + (index < 60 ? 70 : 0));
    const relation = calculateMatrixRelation(series("steps", predictor, "numeric", "amount", segments), series("hrv", outcome, "numeric", "amount", segments));
    expect(Math.abs(relation.coefficient ?? 0)).toBeLessThan(.3);
    expect(relation.featureEligible).toBe(false);
  });

  it("applies Benjamini-Hochberg and features only q below .05", () => {
    const x = Array.from({ length: 100 }, (_, index) => Math.sin(index * 1.27) * 10 + index % 4);
    const relations = [1.2, .4, 0].map((slope, relationIndex) => calculateMatrixRelation(
      series(`x-${relationIndex}`, x, "numeric", undefined),
      series("hrv", x.map((value, index) => 50 + slope * value + Math.sin(index * (1.11 + relationIndex))), "numeric", undefined),
    ));
    const adjusted = adjustMatrixRelations(relations);
    expect(adjusted.every((relation) => relation.qValue >= relation.pValue)).toBe(true);
    expect(adjusted.every((relation) => relation.featureEligible === (relation.qValue < .05))).toBe(true);
  });
});
