import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callbacks: [] as Array<() => Promise<void>>,
  loadPersonalLabMatrixData: vi.fn(),
  buildPersonalLabMatrix: vi.fn(),
  putLabMatrixCacheObject: vi.fn(),
  saveDailyLabRelationSnapshot: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: (callback: () => Promise<void>) => { mocks.callbacks.push(callback); },
}));
vi.mock("@/lib/env", () => ({ isLocalPreviewMode: () => false }));
vi.mock("@/lib/lab-matrix-cache", () => ({
  LAB_MATRIX_CACHE_VERSION: "matrix-v19",
  putLabMatrixCacheObject: mocks.putLabMatrixCacheObject,
}));
vi.mock("@/services/meal-preview", () => ({ loadPreviewConfirmedMealRecords: vi.fn() }));
vi.mock("@/services/nutrition-targets", () => ({ loadNutritionTargetsForUser: vi.fn() }));
vi.mock("./personal-lab-data", () => ({
  loadPersonalLabData: vi.fn(),
  loadPersonalLabMatrixData: mocks.loadPersonalLabMatrixData,
}));
vi.mock("./lab-relation-history", () => ({ saveDailyLabRelationSnapshot: mocks.saveDailyLabRelationSnapshot }));
vi.mock("./personal-lab-preview", () => ({ previewData: vi.fn() }));
vi.mock("./personal-lab-snapshot", () => ({
  buildJournalView: vi.fn(),
  buildOverview: vi.fn(),
  buildPersonalLabMatrix: mocks.buildPersonalLabMatrix,
  buildSnapshot: vi.fn(),
}));

import { getPersonalLabMatrixWithTimings } from "./personal-lab";
import type { PersonalLabSnapshot } from "./personal-lab-types";

function matrixFixture(): PersonalLabSnapshot["matrix"] {
  return {
    analysisEndDate: "2026-09-26",
    outcomes: [],
    rows: [{ id: "90:journal:test:lag-0", label: "Test", emoji: null, grain: "day", timeScale: "acute", period: 90, lagLabel: "same day", relations: [] }],
    periods: [15, 30, 90, "all"],
    meaningfulRelations: [],
    topRelations: [],
    acuteHighlights: [],
    chronicHighlights: [],
    coverageByMetric: [],
    collectionProgress: [],
  };
}

describe("Strongest Effects deferred writes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callbacks.length = 0;
    mocks.putLabMatrixCacheObject.mockResolvedValue(undefined);
    mocks.saveDailyLabRelationSnapshot.mockResolvedValue(true);
  });

  it("returns a cached matrix before scheduling the 90-day history repair", async () => {
    const matrix = matrixFixture();
    mocks.loadPersonalLabMatrixData.mockResolvedValue({
      matrix,
      timeZone: "Europe/Paris",
      todayDate: "2026-09-26",
      inputRevision: "revision-1",
      cacheKey: "90",
      cacheStatus: "hit",
      timings: { cacheMs: 4, dataMs: 0 },
    });

    const result = await getPersonalLabMatrixWithTimings({ id: "user-1", email: null, displayName: "" }, 90);

    expect(result.matrix).toBe(matrix);
    expect(mocks.saveDailyLabRelationSnapshot).not.toHaveBeenCalled();
    expect(mocks.callbacks).toHaveLength(1);
    await mocks.callbacks[0]();
    expect(mocks.saveDailyLabRelationSnapshot).toHaveBeenCalledWith("user-1", { todayDate: "2026-09-26", matrix }, "revision-1");
    expect(mocks.putLabMatrixCacheObject).not.toHaveBeenCalled();
  });

  it("defers both cache fill and history persistence until after the response", async () => {
    const matrix = matrixFixture();
    mocks.loadPersonalLabMatrixData.mockResolvedValue({
      matrix: null,
      timeZone: "Europe/Paris",
      todayDate: "2026-09-26",
      inputRevision: "revision-1",
      cacheKey: "90",
      cacheStatus: "miss",
      timings: { cacheMs: 4, dataMs: 12 },
      health: [],
      scores: [],
      meals: [],
      journal: { variables: [], entries: [], days: [] },
      metricPreferences: [],
    });
    mocks.buildPersonalLabMatrix.mockReturnValue(matrix);

    await getPersonalLabMatrixWithTimings({ id: "user-1", email: null, displayName: "" }, 90);

    expect(mocks.putLabMatrixCacheObject).not.toHaveBeenCalled();
    expect(mocks.saveDailyLabRelationSnapshot).not.toHaveBeenCalled();
    await mocks.callbacks[0]();
    expect(mocks.putLabMatrixCacheObject).toHaveBeenCalledWith("user-1", "90", expect.objectContaining({
      inputRevision: "revision-1",
      algorithmVersion: "matrix-v19",
      analysisDate: "2026-09-26",
      matrix,
    }));
    expect(mocks.saveDailyLabRelationSnapshot).toHaveBeenCalledWith("user-1", { todayDate: "2026-09-26", matrix }, "revision-1");
  });
});
