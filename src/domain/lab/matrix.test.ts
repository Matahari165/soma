import { describe, expect, it } from "vitest";

import { adjustMatrixRelations, calculateMatrixRelation, MINIMUM_COMPUTABLE_OBSERVATIONS, type MatrixSeries } from "./matrix";

function series(id: string, values: number[], kind: MatrixSeries["kind"] = "numeric"): MatrixSeries {
  return {
    id,
    label: id,
    unit: id === "rhr" ? "bpm" : "min",
    kind,
    points: values.map((value, index) => ({ date: `2026-01-${String(index + 1).padStart(2, "0")}`, value })),
  };
}

describe("personal correlation matrix", () => {
  it("uses only a low technical floor before calculating", () => {
    const relation = calculateMatrixRelation(
      series("activity", Array(MINIMUM_COMPUTABLE_OBSERVATIONS - 1).fill(1)),
      series("rhr", Array(MINIMUM_COMPUTABLE_OBSERVATIONS - 1).fill(55)),
    );
    expect(relation.sampleSize).toBe(MINIMUM_COMPUTABLE_OBSERVATIONS - 1);
    expect(relation.coefficient).toBeNull();
    expect(relation.evidence).toBe("collecting");
  });

  it("reports a real-unit effect for a binary behavior", () => {
    const behavior = series("ran", [...Array(4).fill(0), ...Array(4).fill(1)], "binary");
    const rhr = series("rhr", [...Array(4).fill(61), ...Array(4).fill(56)]);
    const relation = calculateMatrixRelation(behavior, rhr);
    expect(relation.method).toBe("rank-biserial");
    expect(relation.effect).toBe(-5);
    expect(relation.coefficient).toBe(-1);
  });

  it("makes uncertainty narrower when more independent days support the same pattern", () => {
    const short = calculateMatrixRelation(
      series("activity", [1, 2, 3, 4, 5, 6, 7, 8]),
      series("rhr", [1, 3, 2, 5, 4, 7, 6, 8]),
    );
    const longX = Array.from({ length: 28 }, (_, index) => index + 1);
    const longY = longX.map((value, index) => value + (index % 4 === 0 ? 3 : index % 4 === 1 ? -2 : 0));
    const long = calculateMatrixRelation(series("activity", longX), series("rhr", longY));
    expect(long.confidenceHigh - long.confidenceLow).toBeLessThan(short.confidenceHigh - short.confidenceLow);
    expect(long.pValue).toBeLessThan(short.pValue);
  });

  it("adjusts the full matrix when several relations are tested", () => {
    const relations = [
      calculateMatrixRelation(series("a", [1, 2, 3, 4, 5, 6, 7, 8]), series("rhr", [1, 2, 3, 4, 5, 6, 7, 8])),
      calculateMatrixRelation(series("b", [1, 2, 3, 4, 5, 6, 7, 8]), series("rhr", [1, 3, 2, 5, 4, 7, 6, 8])),
      calculateMatrixRelation(series("c", [1, 2, 3, 4, 5, 6, 7, 8]), series("rhr", [4, 1, 8, 3, 7, 2, 6, 5])),
    ];
    const adjusted = adjustMatrixRelations(relations);
    expect(adjusted.every((relation) => relation.qValue >= relation.pValue)).toBe(true);
    expect(adjusted[1].qValue).toBeGreaterThanOrEqual(adjusted[1].pValue);
  });

  it("excludes days missing from either series", () => {
    const predictor = series("sleep", Array.from({ length: 20 }, (_, index) => index));
    const outcome = series("rhr", Array.from({ length: 20 }, (_, index) => 70 - index));
    outcome.points = outcome.points.slice(5);
    expect(calculateMatrixRelation(predictor, outcome).sampleSize).toBe(15);
  });
});
