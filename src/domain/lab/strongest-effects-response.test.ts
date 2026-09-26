import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { selectMeaningfulRelations, selectSummaryRelations, summaryRelationKey, type MatrixRelation } from "./matrix";
import { compactStrongestEffectsRelation, compactStrongestEffectsResponse } from "./strongest-effects-response";

function relation(index: number): MatrixRelation {
  return {
    predictorId: `journal:variable-${index}`, predictorLabel: `Variable ${index}`, predictorUnit: "g", predictorKind: "numeric", predictorPresentation: "amount",
    predictorLow: 0, predictorHigh: 120, predictorDelta: 60,
    outcomeId: "hrv", outcomeLabel: "HRV", outcomeUnit: "ms",
    coefficient: .5, effect: 4 + index / 10, effectConfidenceLow: 2, effectConfidenceHigh: 6, percentEffect: 8,
    baselineMean: 50, comparisonMean: 54, baselineCount: 24, comparisonCount: 24, comparisonLabel: "+60 g",
    modelType: "linear", modelImprovement: 0, nonlinearTested: true,
    sampleSize: 48, effectiveSampleSize: 44, pValue: .001 + index / 10000, qValue: .02 + index / 1000, confidenceLow: .1, confidenceHigh: .8,
    relevance: 1, lagDays: index % 3, grain: "day", timeScale: "acute", period: 90,
    family: "journal-acute", method: "within-person-calendar-hac", evidence: "established",
    stable: true,
    stability: {
      chronologicalBlocks: 4, directionHeldInBlocks: true, trendAdjustedDirectionHeld: true, outlierAdjustedDirectionHeld: true,
      blockEffects: [4.1, 3.8, 4.4, 4.2], blockSampleSizes: [12, 12, 12, 12], magnitudeHeldInBlocks: true,
      adequateBlockCoverage: true, trendMagnitudeHeld: true, outlierMagnitudeHeld: true, outlierModelHeld: true,
      stabilityReasons: Array.from({ length: 8 }, (_, reason) => `Stability explanation ${reason} with extra supporting details.`),
    },
    strength: "strong",
    coverageBySource: Array.from({ length: 5 }, (_, source) => ({ source: `Source ${source}`, pairedDays: 40, pairedWeeks: 8 })),
    sourceEstimates: Array.from({ length: 5 }, (_, source) => ({ source: `Source ${source}`, sampleSize: 40, effect: 4, effectConfidenceLow: 2, effectConfidenceHigh: 6, coefficient: .5, pValue: .001 })),
    doseResponse: { comparisonLabel: "+60 g across all recorded days", effect: 3.8, effectConfidenceLow: 2, effectConfidenceHigh: 5.6, percentEffect: 7.6, baselineMean: 50, comparisonMean: 53.8, sampleSize: 48, pValue: .001, modelType: "linear", modelImprovement: 0, nonlinearTested: true },
    habitualPredictorDelta: 12, habitualEffect: 1.8, minimumDaysRemaining: 0,
    practicallyMeaningful: true, practicalThreshold: 2, practicalRatio: 2, featureEligible: true, exclusionReasons: [], excluded: false,
  };
}

describe("Strongest Effects response DTO", () => {
  it("keeps ranking and display inputs identical while excluding deferred proof payloads", () => {
    const full = Array.from({ length: 18 }, (_, index) => relation(index));
    const compact = full.map(compactStrongestEffectsRelation);
    const rank = (values: typeof full) => selectMeaningfulRelations(values, values.length).map(summaryRelationKey);

    expect(compact).toHaveLength(full.length);
    expect(compact.map(summaryRelationKey)).toEqual(full.map(summaryRelationKey));
    expect(compact.map((item) => item.qValue)).toEqual(full.map((item) => item.qValue));
    expect(compact.map((item) => item.practicalRatio)).toEqual(full.map((item) => item.practicalRatio));
    expect(compact.map((item) => ({
      effect: item.effect,
      effectConfidenceLow: item.effectConfidenceLow,
      effectConfidenceHigh: item.effectConfidenceHigh,
      confidenceLow: item.confidenceLow,
      confidenceHigh: item.confidenceHigh,
      relevance: item.relevance,
      featureEligible: item.featureEligible,
      practicallyMeaningful: item.practicallyMeaningful,
      stable: item.stable,
      excluded: item.excluded,
    }))).toEqual(full.map((item) => ({
      effect: item.effect,
      effectConfidenceLow: item.effectConfidenceLow,
      effectConfidenceHigh: item.effectConfidenceHigh,
      confidenceLow: item.confidenceLow,
      confidenceHigh: item.confidenceHigh,
      relevance: item.relevance,
      featureEligible: item.featureEligible,
      practicallyMeaningful: item.practicallyMeaningful,
      stable: item.stable,
      excluded: item.excluded,
    })));
    expect(selectMeaningfulRelations(compact, compact.length).map(summaryRelationKey)).toEqual(rank(full));
    expect(selectSummaryRelations(compact).map(summaryRelationKey)).toEqual(selectSummaryRelations(full).map(summaryRelationKey));
    expect(compact[0]).not.toHaveProperty("stability");
    expect(compact[0]).not.toHaveProperty("sourceEstimates");
    expect(compact[0]).not.toHaveProperty("coverageBySource");
    expect(compact[0]).not.toHaveProperty("doseResponse");
  });

  it("reduces the matrix JSON payload while keeping all rows, outcomes, periods, and ranking fields", () => {
    const relations = Array.from({ length: 30 }, (_, index) => relation(index));
    const matrix = {
      analysisEndDate: "2026-09-26",
      outcomes: [{ id: "hrv", label: "HRV", unit: "ms", direction: "higher" as const }],
      rows: [{ id: "90:journal:variable-0", label: "Variable", emoji: null, grain: "day" as const, timeScale: "acute" as const, period: 90 as const, lagLabel: "D+0", relations }],
      periods: [15, 30, 90, "all"] as const,
      meaningfulRelations: [], topRelations: [], acuteHighlights: [], chronicHighlights: [], coverageByMetric: [], collectionProgress: [],
    };
    const richPayload = { rows: matrix.rows, outcomes: matrix.outcomes, periods: matrix.periods };
    const compactPayload = compactStrongestEffectsResponse(matrix, "opaque-generation");
    const richBytes = Buffer.byteLength(JSON.stringify(richPayload));
    const compactBytes = Buffer.byteLength(JSON.stringify(compactPayload));
    const richGzip = gzipSync(JSON.stringify(richPayload)).byteLength;
    const compactGzip = gzipSync(JSON.stringify(compactPayload)).byteLength;

    expect(compactPayload.rows).toHaveLength(matrix.rows.length);
    expect(compactPayload.outcomes).toEqual(matrix.outcomes);
    expect(compactPayload.periods).toEqual(matrix.periods);
    expect(compactBytes).toBeLessThan(richBytes * .7);
    expect(compactGzip).toBeLessThan(richGzip);
  });
});
