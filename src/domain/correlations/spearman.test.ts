import { describe, expect, it } from "vitest";

import { spearmanCorrelation } from "./spearman";

const points = (values: number[]) => values.map((value, index) => ({
  date: `2026-07-${(index + 1).toString().padStart(2, "0")}`,
  value,
}));

describe("spearmanCorrelation", () => {
  it("requires at least fourteen paired observations", () => {
    const result = spearmanCorrelation(points([1, 2, 3]), points([3, 2, 1]));
    expect(result.quality).toBe("insufficient");
    expect(result.coefficient).toBeNull();
  });

  it("detects a monotonic inverse relationship", () => {
    const first = Array.from({ length: 20 }, (_, index) => index + 1);
    const result = spearmanCorrelation(points(first), points([...first].reverse()));
    expect(result.coefficient).toBe(-1);
    expect(result.sampleSize).toBe(20);
  });
});
