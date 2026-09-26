import { afterEach, describe, expect, it, vi } from "vitest";

import type { AnalysisPeriod, MatrixRelation } from "@/domain/lab/matrix";
import type { PersonalLabSnapshot } from "@/services/personal-lab";

import { loadAssistantLabAnalyses } from "./lab-analyses";

import { getPersonalLabSnapshot } from "@/services/personal-lab";

vi.mock("@/services/personal-lab", () => ({ getPersonalLabSnapshot: vi.fn() }));

const relation = (overrides: Partial<MatrixRelation> = {}) => ({
  predictorId: "steps",
  predictorLabel: "Steps",
  predictorUnit: "steps",
  predictorKind: "numeric",
  predictorPresentation: "amount",
  predictorLow: 1000,
  predictorHigh: 5000,
  predictorDelta: 4000,
  outcomeId: "hrv",
  outcomeLabel: "HRV",
  outcomeUnit: "ms",
  coefficient: 0.5,
  effect: 3,
  effectConfidenceLow: 1,
  effectConfidenceHigh: 5,
  percentEffect: 7,
  baselineMean: 40,
  comparisonMean: 43,
  baselineCount: 15,
  comparisonCount: 15,
  comparisonLabel: "More steps",
  modelType: "linear",
  modelImprovement: 0,
  nonlinearTested: false,
  sampleSize: 30,
  effectiveSampleSize: 25,
  pValue: 0.01,
  qValue: 0.03,
  confidenceLow: 0.1,
  confidenceHigh: 0.9,
  relevance: 2,
  lagDays: 1,
  grain: "day",
  timeScale: "acute",
  period: 90,
  family: "automatic-acute",
  method: "within-person-calendar-hac",
  evidence: "established",
  stable: true,
  stability: {
    chronologicalBlocks: 4,
    directionHeldInBlocks: true,
    trendAdjustedDirectionHeld: true,
    outlierAdjustedDirectionHeld: true,
    blockEffects: [1, 2, 2, 3],
    blockSampleSizes: [6, 6, 6, 6],
    magnitudeHeldInBlocks: true,
    adequateBlockCoverage: true,
    trendMagnitudeHeld: true,
    outlierMagnitudeHeld: true,
    outlierModelHeld: true,
    stabilityReasons: [],
  },
  strength: "strong",
  coverageBySource: [{ source: "Google Health", pairedDays: 30, pairedWeeks: 0 }],
  sourceEstimates: [{ source: "Google Health", sampleSize: 30, effect: 3, effectConfidenceLow: 1, effectConfidenceHigh: 5, coefficient: 0.5, pValue: 0.01 }],
  doseResponse: null,
  habitualPredictorDelta: null,
  habitualEffect: null,
  practicallyMeaningful: true,
  practicalThreshold: 2,
  practicalRatio: 1.5,
  featureEligible: true,
  exclusionReasons: [],
  excluded: false,
  ...overrides,
}) as unknown as MatrixRelation;

function snapshot(period: AnalysisPeriod, relations: MatrixRelation[], extraPredictors: string[] = []) {
  const predictors = [...new Set([...extraPredictors, ...relations.map((item) => item.predictorId)])];
  const outcomes = [...new Set(["hrv", "rhr", ...relations.map((item) => item.outcomeId)])].map((id) => ({
    id,
    label: id === "hrv" ? "HRV" : id === "rhr" ? "Resting heart rate" : id,
    unit: id === "hrv" ? "ms" : id === "rhr" ? "bpm" : "pts",
    direction: "higher" as const,
  }));
  return {
    metricRegistry: [],
    matrix: {
      analysisEndDate: "2026-09-25",
      outcomes,
      rows: relations.map((item) => ({
        id: `${period}:${item.predictorId}:lag-${item.lagDays}`,
        label: item.predictorLabel,
        emoji: null,
        grain: "day" as const,
        timeScale: "acute" as const,
        period,
        lagLabel: "following day",
        relations: [item],
      })),
      periods: [period],
      meaningfulRelations: [],
      topRelations: [],
      acuteHighlights: [],
      chronicHighlights: [],
      coverageByMetric: predictors.map((id) => ({ id, label: id === "steps" ? "Steps" : id, recordedDays: 20, requiredDays: 10, sources: [] })),
      collectionProgress: [],
    },
  } as unknown as PersonalLabSnapshot;
}

afterEach(() => vi.clearAllMocks());

describe("assistant Personal Lab analysis queries", () => {
  it("uses the 90-day cache window by default and scopes the snapshot to the caller", async () => {
    vi.mocked(getPersonalLabSnapshot).mockResolvedValue(snapshot(90, [relation()]));

    const result = await loadAssistantLabAnalyses("user-1");

    expect(getPersonalLabSnapshot).toHaveBeenCalledTimes(1);
    expect(getPersonalLabSnapshot).toHaveBeenCalledWith({ id: "user-1", email: null, displayName: "" }, { periods: [90] });
    expect(result.periods).toEqual([90]);
    expect(result.mode).toBe("summary");
  });

  it("returns every published targeted pair rather than the old four-result summary", async () => {
    const many = Array.from({ length: 6 }, (_, index) => relation({
      outcomeId: `outcome-${index}`,
      outcomeLabel: `Outcome ${index}`,
      outcomeUnit: "pts",
      effect: index + 1,
      qValue: 0.01 + index / 1000,
      practicalRatio: 1.2 + index / 10,
    }));
    vi.mocked(getPersonalLabSnapshot).mockResolvedValue(snapshot(90, many));

    const result = await loadAssistantLabAnalyses("user-1", { predictorId: "steps", limit: 100 });

    expect(result.relations).toHaveLength(6);
    expect(result.pagination).toMatchObject({ total: 6, hasMore: false });
    expect(result.summaries[0].counts.published).toBe(6);
  });

  it("filters by an outcome ID and compares stable pair IDs across models", async () => {
    vi.mocked(getPersonalLabSnapshot).mockImplementation(async (_user, options) => {
      const period = options?.periods?.[0] ?? 90;
      return snapshot(period, [relation({ period, modelType: period === 15 ? "linear" : "threshold" })]);
    });

    const result = await loadAssistantLabAnalyses("user-2", { periods: [15, 90], outcomeId: "hrv", mode: "compare" });

    expect(getPersonalLabSnapshot).toHaveBeenNthCalledWith(1, { id: "user-2", email: null, displayName: "" }, { periods: [15] });
    expect(getPersonalLabSnapshot).toHaveBeenNthCalledWith(2, { id: "user-2", email: null, displayName: "" }, { periods: [90] });
    const comparisons = (result as { comparisons?: Array<{
      modelChanged: boolean;
      predictorId: string;
      outcomeId: string;
      byPeriod: Array<{ relation: { id: string } | null }>;
    }> }).comparisons;
    if (!comparisons?.length) throw new Error("Expected compared relation pairs.");
    expect(comparisons).toHaveLength(1);
    expect(comparisons[0]).toMatchObject({ modelChanged: true, predictorId: "steps", outcomeId: "hrv" });
    const first = comparisons[0].byPeriod[0].relation;
    const second = comparisons[0].byPeriod[1].relation;
    if (!first || !second) throw new Error("Expected the relation in both requested windows.");
    expect(first.id).toBe(second.id);
  });

  it("distinguishes insufficient evidence from an absent pair and excluded results", async () => {
    vi.mocked(getPersonalLabSnapshot).mockResolvedValue(snapshot(90, [
      relation({ coefficient: null, effect: null, evidence: "insufficient", excluded: false, qValue: 1, featureEligible: false }),
      relation({ outcomeId: "rhr", outcomeLabel: "Resting heart rate", excluded: true, coefficient: null, effect: null, evidence: "insufficient", featureEligible: false }),
    ]));

    const insufficient = await loadAssistantLabAnalyses("user-1", { predictorId: "steps", outcomeId: "hrv" });
    const absent = await loadAssistantLabAnalyses("user-1", { predictorId: "steps", outcomeId: "rhr" });

    expect(insufficient.summaries[0].counts).toMatchObject({ insufficient: 1, absent: 0 });
    expect(absent.summaries[0].counts).toMatchObject({ excluded: 1, filtered: 1, absent: 0 });
  });

  it("reports a valid predictor and outcome pair as absent when Soma has no evaluated relation", async () => {
    vi.mocked(getPersonalLabSnapshot).mockResolvedValue(snapshot(90, [], ["steps"]));

    const result = await loadAssistantLabAnalyses("user-1", { predictorId: "steps", outcomeId: "hrv" });

    expect(result.missingFilters).toEqual([]);
    expect(result.summaries[0].counts.absent).toBe(1);
    expect(result.relations).toEqual([]);
  });

  it("does not reveal a metric outside the current user's analysis catalog", async () => {
    vi.mocked(getPersonalLabSnapshot).mockResolvedValue(snapshot(90, [relation()]));

    const result = await loadAssistantLabAnalyses("user-1", { predictorId: "another-users-private-variable" });

    expect(result.missingFilters).toEqual(["predictorId"]);
    expect(result.relations).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("Another user's private variable label");
  });
});
