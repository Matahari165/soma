import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { MatrixRelation } from "@/domain/lab/matrix";

import { effectText, findingSentence, percentText, RelationDetail } from "./relation-detail";

function makeRelation(overrides: Partial<MatrixRelation> = {}): MatrixRelation {
  return {
    predictorId: "wake_time", predictorLabel: "Wake time", predictorUnit: "min", predictorKind: "numeric",
    predictorPresentation: "clock-time", predictorLow: 480, predictorHigh: 510, predictorDelta: 30,
    outcomeId: "sleep_awake", outcomeLabel: "Awake time", outcomeUnit: "min",
    coefficient: -.4, effect: -16, effectConfidenceLow: -25, effectConfidenceHigh: -7,
    percentEffect: -51.7, baselineMean: 31, comparisonMean: 15,
    baselineCount: 30, comparisonCount: 30, comparisonLabel: "30 min later",
    modelType: "linear", modelImprovement: 0, nonlinearTested: true,
    sampleSize: 30, effectiveSampleSize: 30, pValue: .01, qValue: .03,
    confidenceLow: -.4, confidenceHigh: -.1, relevance: 1, lagDays: 0,
    grain: "day", timeScale: "acute", period: 30, family: "automatic-acute",
    method: "raw-within-person-hac", evidence: "established", stable: true,
    stability: { chronologicalBlocks: 4, directionHeldInBlocks: true, trendAdjustedDirectionHeld: true, outlierAdjustedDirectionHeld: true },
    strength: "clear", coverageBySource: [{ source: "Demo", pairedDays: 30, pairedWeeks: 0 }], sourceEstimates: [],
    doseResponse: null, habitualPredictorDelta: 25, habitualEffect: -13,
    practicallyMeaningful: true, practicalThreshold: 5, practicalRatio: 3,
    featureEligible: true, exclusionReasons: [], excluded: false,
    ...overrides,
  };
}

describe("relation detail formatting", () => {
  it("uses percentage points for an outcome already expressed as a percentage", () => {
    expect(effectText({ effect: 1.3, outcomeUnit: "%" })).toBe("+1.3 pp");
  });

  it("does not invent a relative percentage when none was calculated", () => {
    expect(percentText({ percentEffect: null })).toBeNull();
  });

  it("uses a natural sentence for an overnight decrease", () => {
    expect(findingSentence(makeRelation())).toBe(
      "Wake time (30 minutes later) is associated with a decrease of 16 minutes in Awake time during the same sleep episode (51.7% decrease compared with baseline).",
    );
  });

  it("describes positive percentage-point effects and amount contrasts clearly", () => {
    expect(findingSentence(makeRelation({
      predictorId: "caffeine",
      predictorLabel: "Caffeine",
      predictorUnit: "mg",
      predictorPresentation: "amount",
      comparisonLabel: "20 mg avg vs 0",
      outcomeId: "sleep_efficiency",
      outcomeLabel: "Sleep efficiency",
      outcomeUnit: "%",
      effect: 1.3,
      effectConfidenceLow: .2,
      effectConfidenceHigh: 2.4,
      percentEffect: null,
      lagDays: 1,
    }))).toBe(
      "Caffeine (20 mg on average rather than zero) is associated with an increase of 1.3 percentage points in Sleep efficiency during the following night.",
    );
  });

  it("handles plural predictors and continuous contrasts without awkward grammar", () => {
    expect(findingSentence(makeRelation({
      predictorId: "steps",
      predictorLabel: "Steps",
      predictorUnit: "steps",
      predictorPresentation: "amount",
      comparisonLabel: "+100 steps",
      outcomeId: "recovery",
      outcomeLabel: "Recovery",
      outcomeUnit: "pts",
      effect: 4,
      effectConfidenceLow: 1,
      effectConfidenceHigh: 7,
      percentEffect: null,
      lagDays: 1,
    }))).toBe(
      "Steps (100 steps higher) are associated with an increase of 4 points in Recovery during the following night.",
    );
  });

  it("keeps interval, p, and q together and removes redundant detail copy", () => {
    const html = renderToStaticMarkup(createElement(RelationDetail, {
      relations: [makeRelation()],
      direction: "lower",
      onClose: () => undefined,
      detailRef: createRef<HTMLElement>(),
    }));

    expect(html).not.toContain("Each percentage below is the relative change");
    expect(html).not.toContain("Compared days");
    expect(html).not.toContain("q &lt; 0.05");
    expect(html).toContain("95% interval · tests");
    expect(html).toContain("p 0.010 · q 0.030");
    expect(html).toContain("Significant");
  });
});
