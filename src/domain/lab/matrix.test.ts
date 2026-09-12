import { describe, expect, it } from "vitest";

import { adjustMatrixRelations, calculateMatrixRelation, isPersonalLabDisplayableRelation, isPersonalLabFeatureEligible, isPersonalLabMetricAllowed, PRACTICAL_EFFECT_THRESHOLDS, protectAgainstExtremeImportErrors, selectMeaningfulRelations, type MatrixSeries } from "./matrix";

function date(index: number) {
  const value = new Date("2025-01-01T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + index);
  return value.toISOString().slice(0, 10);
}

function series(id: string, values: Array<number | null>, kind: MatrixSeries["kind"] = "numeric", presentation: MatrixSeries["presentation"] = "amount", segments?: string[]): MatrixSeries {
  return { id, label: id, unit: id === "hrv" ? "ms" : "min", kind, presentation, points: values.flatMap((value, index) => value === null ? [] : [{ date: date(index), value, segment: segments?.[index] }]) };
}

describe("Personal Lab raw within-person relations", () => {
  it("shares the Personal Lab metric and feature eligibility gate", () => {
    expect(isPersonalLabMetricAllowed("sleep_awakenings")).toBe(false);
    expect(isPersonalLabMetricAllowed("sleep_fragmentation")).toBe(true);
    const relation = calculateMatrixRelation(series("bedtime", Array.from({ length: 80 }, (_, index) => 1320 + index % 30)), series("hrv", Array.from({ length: 80 }, (_, index) => 50 + index % 20)));
    const eligible = { ...relation, featureEligible: true, practicallyMeaningful: true, excluded: false, qValue: .01, practicalRatio: 2, stable: true };
    for (const period of [15, 30, 90, "all"] as const) {
      const periodRelation = { ...eligible, period };
      expect(isPersonalLabFeatureEligible(periodRelation)).toBe(true);
    }
    expect(isPersonalLabFeatureEligible({ ...eligible, qValue: .05 })).toBe(false);
    expect(isPersonalLabFeatureEligible({ ...eligible, practicallyMeaningful: false })).toBe(false);
    expect(isPersonalLabFeatureEligible({ ...eligible, stable: false })).toBe(false);
    expect(isPersonalLabFeatureEligible({ ...eligible, outcomeId: "sleep_awakenings" })).toBe(false);
    expect(selectMeaningfulRelations([{ ...eligible, outcomeId: "sleep_awakenings" }])).toEqual([]);
  });

  it("publishes with the observed direction in at least two of four chronological blocks", () => {
    const blockStrengths = [8, -1, 8, -1];
    const predictor = Array.from({ length: 400 }, (_, index) => [-3, -1, 1, 3][index % 4]);
    const outcome = predictor.map((value, index) => value * blockStrengths[Math.floor(index / 100)]);
    const relation = calculateMatrixRelation(series("load", predictor), series("hrv", outcome));

    expect(relation.stability).toMatchObject({ chronologicalBlocks: 2, directionHeldInBlocks: true });
    expect(relation.stable).toBe(true);
    expect(isPersonalLabFeatureEligible(relation)).toBe(true);

    const oneMatchingBlock = calculateMatrixRelation(
      series("load", predictor),
      series("hrv", predictor.map((value, index) => value * [8, -1, -1, -1][Math.floor(index / 100)])),
    );
    expect(oneMatchingBlock.stability).toMatchObject({ chronologicalBlocks: 1, directionHeldInBlocks: false });
    expect(oneMatchingBlock.stable).toBe(false);
    expect(isPersonalLabFeatureEligible(oneMatchingBlock)).toBe(false);
  });

  it("can relax only the chronological stability gate", () => {
    const eligible = {
      predictorId: "steps", outcomeId: "hrv", excluded: false, featureEligible: true,
      qValue: .01, practicallyMeaningful: true, stable: false,
    } as const;

    expect(isPersonalLabDisplayableRelation(eligible)).toBe(false);
    expect(isPersonalLabDisplayableRelation(eligible, { requireTemporalStability: false })).toBe(true);
    expect(isPersonalLabDisplayableRelation({ ...eligible, qValue: .05 }, { requireTemporalStability: false })).toBe(false);
    expect(isPersonalLabDisplayableRelation({ ...eligible, practicallyMeaningful: false }, { requireTemporalStability: false })).toBe(false);
    expect(isPersonalLabDisplayableRelation({ ...eligible, excluded: true }, { requireTemporalStability: false })).toBe(false);
  });

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

  it("adds a readable dose response across caffeine and zero-caffeine days", () => {
    const caffeine = Array.from({ length: 120 }, (_, index) => index % 3 === 0 ? 0 : 80 + index % 5 * 40);
    const rhr = caffeine.map((value, index) => 52 + value * .025 + Math.sin(index * 1.7));
    const predictor = { ...series("caffeine", caffeine), unit: "mg" };
    const relation = calculateMatrixRelation(predictor, { ...series("rhr", rhr), unit: "bpm" });
    expect(relation.comparisonLabel).toContain("avg vs 0");
    expect(relation.doseResponse?.comparisonLabel).toMatch(/^\+\d+ mg across all recorded days$/);
    expect(relation.doseResponse?.modelType).toBe("linear");
    expect(relation.doseResponse?.nonlinearTested).toBe(true);
    expect(relation.doseResponse?.effect).toBeGreaterThan(0);
    expect(relation.doseResponse?.sampleSize).toBe(120);
  });

  it("includes zero days in the gradual dose estimate", () => {
    const caffeine = Array.from({ length: 60 }, (_, index) => index < 30 ? 0 : index < 50 ? 100 : 200);
    const rhr = caffeine.map((value, index) => 50 + value * .02 + Math.sin(index) * .1);
    const relation = calculateMatrixRelation(
      { ...series("caffeine", caffeine), unit: "mg" },
      { ...series("rhr", rhr), unit: "bpm" },
    );
    expect(relation.doseResponse?.sampleSize).toBe(caffeine.length);
    expect(relation.doseResponse?.comparisonLabel).toContain("across all recorded days");
    expect(relation.doseResponse?.effect).toBeCloseTo(2, 0);
  });

  it("detects a non-linear caffeine threshold while keeping zero versus exposure", () => {
    const caffeine = Array.from({ length: 120 }, (_, index) => index % 4 * 100);
    const rhr = caffeine.map((value, index) => 52 + (value >= 300 ? 10 : 0) + Math.sin(index * 1.3) * .2);
    const relation = calculateMatrixRelation(
      { ...series("caffeine", caffeine), unit: "mg" },
      { ...series("rhr", rhr), unit: "bpm" },
      0,
      { outcomeDirection: "lower", minimumMeaningfulEffect: 1 },
    );
    expect(relation.modelType).toBe("binary");
    expect(relation.comparisonLabel).toContain("avg vs 0");
    expect(relation.doseResponse?.modelType).toBe("threshold");
    expect(relation.doseResponse?.comparisonLabel).toContain("threshold above");
    expect(relation.doseResponse?.sampleSize).toBe(120);
  });

  it("only reports relative percentages for outcomes with a meaningful zero", () => {
    const values = Array.from({ length: 80 }, (_, index) => 1360 + index % 30);
    const recovery = values.map((value, index) => 75 - (value - 1360) * .1 + Math.sin(index));
    const relation = calculateMatrixRelation(series("bedtime", values, "numeric", "clock-time"), { ...series("recovery", recovery), unit: "pts" });
    expect(relation.percentEffect).toBeNull();
  });

  it("translates clock-time relations into a 30-minute contrast", () => {
    const bedtime = Array.from({ length: 80 }, (_, index) => 1360 + index % 30);
    const recovery = bedtime.map((value, index) => 80 - (value - 1360) * .1 + Math.sin(index));
    const relation = calculateMatrixRelation(series("bedtime", bedtime, "numeric", "clock-time"), series("recovery", recovery));
    expect(relation.predictorDelta).toBe(30);
    expect(relation.comparisonLabel).toBe("30 min later");
    expect(relation.modelType).toBe("linear");
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
    expect(relation.comparisonLabel).toMatch(/^optimal zone \d{2}:\d{2}–\d{2}:\d{2}$/);
    expect(relation.modelType).toBe("optimal-zone");
    expect(relation.modelImprovement).toBeGreaterThan(.1);
    expect(relation.comparisonMean).toBeGreaterThan(relation.baselineMean ?? 0);
  });

  it("detects a high threshold instead of presenting it as one linear slope", () => {
    const input = Array.from({ length: 90 }, (_, index) => index);
    const outcome = input.map((value, index) => 50 + (value > 59 ? 12 : 0) + Math.sin(index * 1.7) * .2);
    const relation = calculateMatrixRelation(
      series("load", input, "numeric", undefined),
      series("hrv", outcome),
      0,
      { outcomeDirection: "higher", minimumMeaningfulEffect: 1 },
    );
    expect(relation.modelType).toBe("threshold");
    expect(relation.comparisonLabel).toMatch(/^threshold above /);
    expect(relation.effect).toBeGreaterThan(10);
  });

  it("detects a plateau after an initial increase", () => {
    const input = Array.from({ length: 90 }, (_, index) => index);
    const outcome = input.map((value, index) => 50 + Math.min(value, 30) * .4 + Math.sin(index * 1.7) * .2);
    const relation = calculateMatrixRelation(
      series("exercise", input, "numeric", undefined),
      series("hrv", outcome),
      0,
      { outcomeDirection: "higher", minimumMeaningfulEffect: 1 },
    );
    expect(relation.modelType).toBe("plateau");
    expect(relation.comparisonLabel).toMatch(/^plateau after /);
  });

  it("detects an adverse middle zone", () => {
    const input = Array.from({ length: 90 }, (_, index) => index);
    const outcome = input.map((value, index) => 60 - (value > 29 && value <= 59 ? 10 : 0) + Math.sin(index * 1.7) * .2);
    const relation = calculateMatrixRelation(
      series("caffeine", input, "numeric", undefined),
      series("hrv", outcome),
      0,
      { outcomeDirection: "higher", minimumMeaningfulEffect: 1 },
    );
    expect(relation.modelType).toBe("adverse-zone");
    expect(relation.comparisonLabel).toMatch(/^adverse zone /);
  });

  it("keeps an actually linear relation linear", () => {
    const input = Array.from({ length: 90 }, (_, index) => index);
    const outcome = input.map((value, index) => 50 + value * .2 + Math.sin(index * 1.7) * .2);
    const relation = calculateMatrixRelation(series("load", input, "numeric", undefined), series("hrv", outcome));
    expect(relation.modelType).toBe("linear");
    expect(relation.modelImprovement).toBe(0);
    expect(relation.nonlinearTested).toBe(true);
  });

  it("does not claim a non-linear check when the window is too short", () => {
    const input = Array.from({ length: 20 }, (_, index) => index);
    const relation = calculateMatrixRelation(series("load", input, "numeric", undefined), series("hrv", input.map((value) => 50 + value)));
    expect(relation.modelType).toBe("linear");
    expect(relation.nonlinearTested).toBe(false);
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

  it("preserves legitimate high-activity days while limiting obvious import errors", () => {
    const activity = [...Array.from({ length: 97 }, (_, index) => 5_000 + index % 14 * 1_000), 25_000, 30_000, 980_000];
    const protectedValues = protectAgainstExtremeImportErrors(activity);
    expect(protectedValues.at(-3)).toBe(25_000);
    expect(protectedValues.at(-2)).toBe(30_000);
    expect(protectedValues.at(-1)).toBeLessThan(100_000);
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

  it("applies every real-unit practical threshold", () => {
    expect(PRACTICAL_EFFECT_THRESHOLDS).toMatchObject({
      sleep_minutes: 15, sleep_efficiency: 1.5, sleep_latency: 5, sleep_awake: 5,
      deep_sleep: 5, rem_sleep: 5, hrv: 2, rhr: 1,
      respiratory: .3, spo2: .3, recovery: 3,
    });
  });

  it("keeps a significant negligible effect in the matrix but out of meaningful selection", () => {
    const values = Array.from({ length: 120 }, (_, index) => index % 12 + Math.sin(index));
    const relation = calculateMatrixRelation(series("steps", values), series("hrv", values.map((value, index) => 50 + value * .05 + Math.sin(index * 1.7) * .01)));
    const significantButSmall = { ...relation, qValue: .01, featureEligible: true, practicallyMeaningful: false, practicalThreshold: 2, practicalRatio: .25 };
    expect(significantButSmall.featureEligible).toBe(true);
    expect(selectMeaningfulRelations([significantButSmall])).toEqual([]);
  });

  it("uses 0.2 standard deviations for a future outcome without an explicit threshold", () => {
    const values = Array.from({ length: 100 }, (_, index) => index % 20 + Math.sin(index));
    const outcome = values.map((value, index) => 10 + value * .5 + Math.sin(index * 1.3));
    const relation = calculateMatrixRelation(series("load", values), series("future_metric", outcome));
    const outcomeMean = outcome.reduce((sum, value) => sum + value, 0) / outcome.length;
    const outcomeSpread = Math.sqrt(outcome.reduce((sum, value) => sum + (value - outcomeMean) ** 2, 0) / (outcome.length - 1));
    expect(relation.practicalThreshold).toBe(.2);
    expect(relation.practicalRatio).toBeCloseTo(Math.abs(relation.effect ?? 0) / outcomeSpread / .2, 1);
  });

  it("prefers the next day unless J+2 is materially larger and statistically clearer", () => {
    const base = calculateMatrixRelation(series("load", Array.from({ length: 80 }, (_, index) => index)), series("hrv", Array.from({ length: 80 }, (_, index) => 40 + index)));
    const relation = (lagDays: number, practicalRatio: number, qValue: number, sampleSize: number) => ({ ...base, lagDays, practicalRatio, qValue, sampleSize, practicallyMeaningful: true, featureEligible: true });
    expect(selectMeaningfulRelations([
      relation(0, 2, .01, 80),
      relation(1, 2, .04, 60),
      relation(2, 2.39, .02, 40),
    ])[0]?.lagDays).toBe(1);
    expect(selectMeaningfulRelations([
      relation(1, 2, .01, 80),
      relation(2, 2.4, .04, 60),
    ])[0]?.lagDays).toBe(1);
    expect(selectMeaningfulRelations([
      relation(1, 2, .04, 80),
      relation(2, 2.4, .02, 60),
    ])[0]?.lagDays).toBe(2);
  });

  it("reports the effect for the observed habitual predictor variation", () => {
    const input = Array.from({ length: 80 }, (_, index) => 5_000 + index % 20 * 500);
    const relation = calculateMatrixRelation(series("steps", input), series("hrv", input.map((value) => 40 + value * .001)));
    expect(relation.habitualPredictorDelta).toBeGreaterThan(4_000);
    expect(relation.habitualEffect).toBeGreaterThan(4);
  });

  it("keeps target outcomes eligible when their real-unit effect clears the threshold", () => {
    const bedtime = Array.from({ length: 100 }, (_, index) => 1320 + index % 40);
    const sleep = bedtime.map((value, index) => 470 + (value - 1320) * .8 + Math.sin(index));
    const relation = calculateMatrixRelation(series("bedtime", bedtime, "numeric", "clock-time"), series("sleep_minutes", sleep), 0, { outcomeDirection: "target", outcomeTarget: 510 });
    expect(relation.practicalThreshold).toBe(15);
    expect(relation.practicalRatio).toBeGreaterThanOrEqual(1);
  });
});
