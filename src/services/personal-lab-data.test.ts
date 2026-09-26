import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCloudflareAdminClient: vi.fn(),
  labMatrixInputRevision: vi.fn(),
  getLabMatrixCacheObject: vi.fn(),
  loadJournalData: vi.fn(),
  loadConfirmedMealRecords: vi.fn(),
  loadNutritionTargetsForUser: vi.fn(),
}));

vi.mock("@/lib/cloudflare/db", () => ({
  createCloudflareAdminClient: mocks.createCloudflareAdminClient,
  labMatrixInputRevision: mocks.labMatrixInputRevision,
}));
vi.mock("@/lib/lab-matrix-cache", () => ({
  LAB_MATRIX_CACHE_VERSION: "matrix-v19",
  getLabMatrixCacheObject: mocks.getLabMatrixCacheObject,
}));
vi.mock("@/services/journal", () => ({ loadJournalData: mocks.loadJournalData }));
vi.mock("@/services/meals", () => ({ loadConfirmedMealRecords: mocks.loadConfirmedMealRecords }));
vi.mock("@/services/nutrition-targets", () => ({ loadNutritionTargetsForUser: mocks.loadNutritionTargetsForUser }));
vi.mock("@/services/supplements", () => ({ listSupplementDefinitions: vi.fn(), listSupplementEntries: vi.fn() }));

import { dateInTimezone } from "./personal-lab-today";
import { loadPersonalLabMatrixData } from "./personal-lab-data";

function matrixFixture() {
  return {
    analysisEndDate: dateInTimezone("Europe/Paris"),
    outcomes: [],
    rows: [],
    periods: [15, 30, 90, "all"],
    meaningfulRelations: [],
    topRelations: [],
    acuteHighlights: [],
    chronicHighlights: [],
    coverageByMetric: [],
    collectionProgress: [],
  };
}

function queryResult(data: unknown) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "gte", "limit"]) {
    query[method] = vi.fn(() => query);
  }
  query.maybeSingle = vi.fn(async () => ({ data, error: null }));
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve, reject);
  return query;
}

describe("Strongest Effects matrix loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.labMatrixInputRevision.mockResolvedValue("revision-1");
    mocks.getLabMatrixCacheObject.mockResolvedValue({
      inputRevision: "revision-1",
      algorithmVersion: "matrix-v19",
      analysisDate: dateInTimezone("Europe/Paris"),
      matrix: matrixFixture(),
    });
    mocks.loadJournalData.mockResolvedValue({ variables: [], entries: [], days: [] });
    mocks.loadConfirmedMealRecords.mockResolvedValue([]);
    mocks.loadNutritionTargetsForUser.mockResolvedValue(null);
    mocks.createCloudflareAdminClient.mockReturnValue({
      from: vi.fn((table: string) => queryResult(table === "profiles" ? { timezone: "Europe/Paris" } : [])),
    });
  });

  it("returns a same-day revision match before reading matrix sources", async () => {
    const result = await loadPersonalLabMatrixData("user-1", 90);
    const admin = mocks.createCloudflareAdminClient.mock.results[0]?.value;

    expect(result.cacheStatus).toBe("hit");
    expect(result.timings.dataMs).toBe(0);
    expect(result.matrix).toEqual(matrixFixture());
    expect(admin.from.mock.calls.map(([table]: [string]) => table)).toEqual(["profiles"]);
    expect(mocks.loadJournalData).not.toHaveBeenCalled();
    expect(mocks.loadConfirmedMealRecords).not.toHaveBeenCalled();
    expect(mocks.loadNutritionTargetsForUser).not.toHaveBeenCalled();
  });

  it("loads only matrix inputs in parallel when the input revision changes", async () => {
    mocks.labMatrixInputRevision.mockResolvedValue("revision-2");
    const result = await loadPersonalLabMatrixData("user-1", 30);
    const admin = mocks.createCloudflareAdminClient.mock.results[0]?.value;
    const tables = admin.from.mock.calls.map(([table]: [string]) => table);

    expect(result.cacheStatus).toBe("miss");
    expect(result.matrix).toBeNull();
    expect(tables).toEqual(["profiles", "daily_health_metrics", "daily_scores", "lab_metric_preferences"]);
    expect(mocks.loadConfirmedMealRecords).toHaveBeenCalledWith("user-1", { from: expect.any(String) });
    expect(mocks.loadJournalData).toHaveBeenCalledWith("user-1", expect.objectContaining({
      from: expect.any(String),
      mealRecords: expect.any(Promise),
      automaticHealth: expect.any(Promise),
      ensureDefaults: false,
    }));
    expect(mocks.loadNutritionTargetsForUser).not.toHaveBeenCalled();
  });
});
