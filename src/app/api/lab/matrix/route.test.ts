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
import type { PersonalLabSnapshot } from "@/services/personal-lab-types";
import type { MatrixRelation } from "@/domain/lab/matrix";

function matrixFixture(): PersonalLabSnapshot["matrix"] {
  const relation = {
    predictorId: "journal:reading", predictorLabel: "Reading", predictorUnit: "min", predictorKind: "numeric", predictorPresentation: "amount",
    predictorLow: 0, predictorHigh: 30, predictorDelta: 30,
    outcomeId: "hrv", outcomeLabel: "HRV", outcomeUnit: "ms",
    coefficient: .4, effect: 4, effectConfidenceLow: 2, effectConfidenceHigh: 6, percentEffect: 8,
    baselineMean: 50, comparisonMean: 54, baselineCount: 12, comparisonCount: 12, comparisonLabel: "+30 min",
    modelType: "linear", modelImprovement: 0, nonlinearTested: true,
    sampleSize: 24, effectiveSampleSize: 22, pValue: .001, qValue: .01, confidenceLow: .2, confidenceHigh: .7,
    relevance: .9, lagDays: 1, grain: "day", timeScale: "acute", period: 90,
    family: "journal-acute", method: "within-person-calendar-hac", evidence: "established",
    stable: true, stability: { chronologicalBlocks: 4, directionHeldInBlocks: true, trendAdjustedDirectionHeld: true, outlierAdjustedDirectionHeld: true, blockEffects: [4, 4, 4, 4], stabilityReasons: ["A detailed reason"] },
    strength: "strong", coverageBySource: [{ source: "Journal", pairedDays: 24, pairedWeeks: 8 }],
    sourceEstimates: [{ source: "Journal", sampleSize: 24, effect: 4, effectConfidenceLow: 2, effectConfidenceHigh: 6, coefficient: .4, pValue: .001 }],
    doseResponse: { comparisonLabel: "all days", effect: 3, effectConfidenceLow: 2, effectConfidenceHigh: 4, percentEffect: 6, baselineMean: 50, comparisonMean: 53, sampleSize: 24, pValue: .002, modelType: "linear", modelImprovement: 0, nonlinearTested: true },
    habitualPredictorDelta: 2, habitualEffect: .3, minimumDaysRemaining: 0,
    practicallyMeaningful: true, practicalThreshold: 2, practicalRatio: 2, featureEligible: true, exclusionReasons: [], excluded: false,
  } as MatrixRelation;
  return {
    analysisEndDate: "2026-09-26",
    outcomes: [{ id: "hrv", label: "HRV", unit: "ms", direction: "higher" }],
    rows: [{ id: "90:journal:reading", label: "Reading", emoji: null, grain: "day", timeScale: "acute", period: 90, lagLabel: "J+1", relations: [relation] }],
    periods: [15, 30, 90, "all"],
    meaningfulRelations: [], topRelations: [], acuteHighlights: [], chronicHighlights: [], coverageByMetric: [], collectionProgress: [],
  };
}

function request(query = "") {
  return new NextRequest(`https://soma.example/api/lab/matrix${query}`);
}

describe("Strongest Effects matrix API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "session-user", email: null, displayName: "" });
    mocks.getPersonalLabMatrixWithTimings.mockResolvedValue({
      matrix: matrixFixture(),
      timings: { cacheMs: 2, dataMs: 0, buildMs: 0, cacheStatus: "hit" },
    });
  });

  it("keeps the legacy rich payload as the default for existing clients", async () => {
    const response = await GET(request("?period=90"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body.rows[0].relations[0].stability.blockEffects).toEqual([4, 4, 4, 4]);
    expect(body.rows[0].relations[0].doseResponse).not.toBeNull();
    expect(body.generation).toBeUndefined();
  });

  it("returns the compact DTO and an opaque generation token when requested", async () => {
    const response = await GET(request("?period=90&format=compact"));
    const body = await response.json();
    const relation = body.rows[0].relations[0];

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body.generation).toBe("g".repeat(43));
    expect(relation).toMatchObject({ predictorId: "journal:reading", outcomeId: "hrv", qValue: .01, confidenceLow: .2, confidenceHigh: .7 });
    expect(relation).not.toHaveProperty("stability");
    expect(relation).not.toHaveProperty("doseResponse");
    expect(relation).not.toHaveProperty("sourceEstimates");
  });

  it("requires the current session owner and validates period before reading the matrix", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await GET(request("?period=90&format=compact"))).status).toBe(401);
    expect(mocks.getPersonalLabMatrixWithTimings).not.toHaveBeenCalled();

    mocks.getCurrentUser.mockResolvedValue({ id: "session-user" });
    expect((await GET(request("?period=7&format=compact"))).status).toBe(400);
    expect(mocks.getPersonalLabMatrixWithTimings).not.toHaveBeenCalled();
  });
});
