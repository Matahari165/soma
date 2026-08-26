import { describe, expect, it } from "vitest";

import { calculateMatrixRelation, type MatrixSeries } from "@/domain/lab/matrix";
import type { PersonalLabSnapshot } from "@/services/personal-lab";

import { groupMatrixRows } from "./relationship-groups";

function series(id: string, slope = 1): MatrixSeries {
  const start = new Date("2026-01-01T12:00:00Z");
  return {
    id,
    label: id,
    unit: "min",
    kind: "numeric",
    presentation: "amount",
    points: Array.from({ length: 80 }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + index);
      return { date: date.toISOString().slice(0, 10), value: index * slope + Math.sin(index) };
    }),
  };
}

describe("groupMatrixRows", () => {
  it("keeps J+1 and J+2 in one predictor row and one outcome cell", () => {
    const predictor = series("caffeine");
    const outcome = series("hrv", 2);
    const relations = [1, 2].map((lagDays) => ({ ...calculateMatrixRelation(predictor, outcome, lagDays), featureEligible: true, qValue: .01 }));
    const rows = relations.map((relation) => ({
      id: `caffeine-${relation.lagDays}`,
      label: "Caffeine",
      emoji: "⚡",
      grain: "day" as const,
      timeScale: "acute" as const,
      period: 30 as const,
      lagLabel: `J+${relation.lagDays}`,
      relations: [relation],
    })) satisfies PersonalLabSnapshot["matrix"]["rows"];

    const grouped = groupMatrixRows(rows, ["hrv"], false);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].relationsByOutcome[0].map((relation) => relation.lagDays)).toEqual([1, 2]);
  });
});
