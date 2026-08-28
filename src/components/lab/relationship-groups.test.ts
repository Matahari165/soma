import { describe, expect, it } from "vitest";

import { calculateMatrixRelation, type MatrixSeries } from "@/domain/lab/matrix";
import type { PersonalLabSnapshot } from "@/services/personal-lab";

import { calculableRelations, groupMatrixRows, influenceGroup, significantRelations } from "./relationship-groups";

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
  it("groups related influences without merging their rows", () => {
    expect(influenceGroup("effort")).toBe("Activity load");
    expect(influenceGroup("exercise_minutes")).toBe("Activity load");
    expect(influenceGroup("steps")).toBe("Daily movement");
    expect(influenceGroup("journal:reading")).toBe("Journal habits");
  });
  it("keeps running and sedentary influences in one coherent group", () => {
    expect(["sedentary_minutes", "running_distance", "running_pace", "running_average_heart_rate", "vo2_max"].every((id) => influenceGroup(id) === "Running & sedentary time")).toBe(true);
  });
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

    const grouped = groupMatrixRows(rows, ["hrv"]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].relationsByOutcome[0].map((relation) => relation.lagDays)).toEqual([1, 2]);
  });

  it("keeps journal rows visible while they are still collecting data", () => {
    const relation = calculateMatrixRelation(
      { ...series("journal:reading"), points: series("journal:reading").points.slice(0, 4) },
      { ...series("hrv", 2), points: series("hrv", 2).points.slice(0, 4) },
      1,
      { family: "journal-acute" },
    );
    const rows = [{
      id: "reading-1", label: "Evening reading", emoji: "📖", grain: "day" as const,
      timeScale: "acute" as const, period: 30 as const, lagLabel: "J+1", relations: [relation],
    }] satisfies PersonalLabSnapshot["matrix"]["rows"];

    expect(groupMatrixRows(rows, ["hrv"])).toHaveLength(1);
  });

  it("keeps non-significant relations for matrix exploration only", () => {
    const base = calculateMatrixRelation(series("steps"), series("hrv", 2));
    const published = { ...base, featureEligible: true, practicallyMeaningful: true, excluded: false, qValue: .01 };
    const exploratory = { ...published, qValue: .2 };
    expect(calculableRelations([published, exploratory])).toHaveLength(2);
    expect(significantRelations([published, exploratory])).toEqual([published]);
  });

  it("places wearable groups before journal habits", () => {
    const predictorIds = ["journal:reading", "effort", "steps", "bedtime"];
    const rows = predictorIds.map((predictorId) => ({
      id: predictorId,
      label: predictorId,
      emoji: null,
      grain: "day" as const,
      timeScale: "acute" as const,
      period: 30 as const,
      lagLabel: "J+1",
      relations: [{ ...calculateMatrixRelation(series(predictorId), series("hrv", 2), 1), predictorId }],
    })) satisfies PersonalLabSnapshot["matrix"]["rows"];

    expect(groupMatrixRows(rows, ["hrv"]).map((row) => row.group)).toEqual([
      "Sleep pattern",
      "Daily movement",
      "Activity load",
      "Journal habits",
    ]);
  });
});
