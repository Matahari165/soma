import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getPersonalLabMatrixWithTimings: vi.fn(),
  strongestEffectsGeneration: vi.fn(() => "g".repeat(43)),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/services/personal-lab", () => ({ getPersonalLabMatrixWithTimings: mocks.getPersonalLabMatrixWithTimings }));
vi.mock("@/services/strongest-effects-generation", () => ({ strongestEffectsGeneration: mocks.strongestEffectsGeneration }));

import { GET } from "./route";
import { summaryRelationKey, type MatrixRelation } from "@/domain/lab/matrix";

function relation(lagDays: number, stable = true): MatrixRelation {
  return {
    predictorId: "journal:reading", predictorLabel: "Reading", predictorUnit: "min", predictorKind: "numeric", predictorPresentation: "amount",
    predictorLow: 0, predictorHigh: 30, predictorDelta: 30,
    outcomeId: "hrv", outcomeLabel: "HRV", outcomeUnit: "ms",
    coefficient: .4, effect: 4, effectConfidenceLow: 2, effectConfidenceHigh: 6, percentEffect: 8,
    baselineMean: 50, comparisonMean: 54, baselineCount: 12, comparisonCount: 12, comparisonLabel: "+30 min",
    modelType: "linear", modelImprovement: 0, nonlinearTested: true,
    sampleSize: 24, effectiveSampleSize: 22, pValue: .001, qValue: .01, confidenceLow: .2, confidenceHigh: .7,
    relevance: .9, lagDays, grain: "day", timeScale: "acute", period: 90,
    family: "journal-acute", method: "within-person-calendar-hac", evidence: "established",
    stable, stability: { chronologicalBlocks: 4, directionHeldInBlocks: true, trendAdjustedDirectionHeld: true, outlierAdjustedDirectionHeld: true, blockEffects: [4, 4, 4, 4], stabilityReasons: ["A detailed reason"] },
    strength: "strong", coverageBySource: [{ source: "Journal", pairedDays: 24, pairedWeeks: 8 }],
    sourceEstimates: [{ source: "Journal", sampleSize: 24, effect: 4, effectConfidenceLow: 2, effectConfidenceHigh: 6, coefficient: .4, pValue: .001 }],
    doseResponse: { comparisonLabel: "all days", effect: 3, effectConfidenceLow: 2, effectConfidenceHigh: 4, percentEffect: 6, baselineMean: 50, comparisonMean: 53, sampleSize: 24, pValue: .002, modelType: "linear", modelImprovement: 0, nonlinearTested: true },
    habitualPredictorDelta: 2, habitualEffect: .3, minimumDaysRemaining: 0,
    practicallyMeaningful: true, practicalThreshold: 2, practicalRatio: 2, featureEligible: true, exclusionReasons: [], excluded: false,
  };
}

const primary = relation(1);
const secondary = relation(2, false);
const matrix = {
  analysisEndDate: "2026-09-26",
  outcomes: [{ id: "hrv", label: "HRV", unit: "ms", direction: "higher" as const }],
  rows: [{ id: "90:journal:reading", label: "Reading", emoji: null, grain: "day" as const, timeScale: "acute" as const, period: 90 as const, lagLabel: "J+1", relations: [primary, secondary] }],
  periods: [15, 30, 90, "all"] as const,
  meaningfulRelations: [], topRelations: [], acuteHighlights: [], chronicHighlights: [], coverageByMetric: [], collectionProgress: [],
};

function request(query: string) {
  return new NextRequest(`https://soma.example/api/lab/matrix/detail?${query}`);
}

function query(overrides: Record<string, string> = {}) {
  const params = new URLSearchParams({
    period: "90",
    generation: "g".repeat(43),
    relationKey: summaryRelationKey(primary),
    requireTemporalStability: "false",
    userId: "untrusted-query-user",
    ...overrides,
  });
  return params.toString();
}

describe("Strongest Effects relation detail API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "session-owner", email: null, displayName: "" });
    mocks.getPersonalLabMatrixWithTimings.mockResolvedValue({
      matrix,
      timings: { cacheMs: 2, dataMs: 0, buildMs: 0, cacheStatus: "hit" },
    });
    mocks.strongestEffectsGeneration.mockReturnValue("g".repeat(43));
  });

  it("returns the rich selected relation and its matching published effects for the session owner", async () => {
    const response = await GET(request(query()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body.generation).toBe("g".repeat(43));
    expect(body.relations).toHaveLength(2);
    expect(body.relations[0]).toMatchObject({ predictorId: primary.predictorId, lagDays: 1, stability: primary.stability, doseResponse: primary.doseResponse });
    expect(mocks.getPersonalLabMatrixWithTimings).toHaveBeenCalledWith({ id: "session-owner", email: null, displayName: "" }, 90, { persist: false });
  });

  it("filters the selected relation set with the requested temporal stability preference", async () => {
    const response = await GET(request(query({ requireTemporalStability: "true" })));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.relations.map((item: MatrixRelation) => item.lagDays)).toEqual([1]);
  });

  it("rejects a mismatched generation before returning relation data", async () => {
    mocks.strongestEffectsGeneration.mockReturnValue("x".repeat(43));
    const response = await GET(request(query()));
    expect(response.status).toBe(409);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ error: expect.any(String) });
  });

  it("requires the authenticated owner and validates query fields before loading the matrix", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await GET(request(query()))).status).toBe(401);
    expect(mocks.getPersonalLabMatrixWithTimings).not.toHaveBeenCalled();

    mocks.getCurrentUser.mockResolvedValue({ id: "session-owner" });
    expect((await GET(request(query({ period: "7" })))).status).toBe(400);
    expect((await GET(request(query({ relationKey: "not-json" })))).status).toBe(400);
    expect(mocks.getPersonalLabMatrixWithTimings).not.toHaveBeenCalled();
  });
});
