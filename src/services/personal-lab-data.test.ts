import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCloudflareAdminClient: vi.fn(),
  labMatrixInputRevision: vi.fn(),
  getLabMatrixCacheObject: vi.fn(),
  loadJournalData: vi.fn(),
  listMeals: vi.fn(),
  loadConfirmedMealRecords: vi.fn(),
  loadNutritionTargetsForUser: vi.fn(),
  loadNutritionTargetsStateForUser: vi.fn(),
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
vi.mock("@/services/meals", () => ({ listMeals: mocks.listMeals, loadConfirmedMealRecords: mocks.loadConfirmedMealRecords }));
vi.mock("@/services/nutrition-targets", () => ({ loadNutritionTargetsForUser: mocks.loadNutritionTargetsForUser, loadNutritionTargetsStateForUser: mocks.loadNutritionTargetsStateForUser }));
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
  for (const method of ["select", "eq", "order", "gte", "lte", "in", "limit"]) {
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
    mocks.listMeals.mockResolvedValue([]);
    mocks.loadConfirmedMealRecords.mockResolvedValue([]);
    mocks.loadNutritionTargetsForUser.mockResolvedValue(null);
    mocks.loadNutritionTargetsStateForUser.mockResolvedValue({ targets: { caloriesKcal: { low: 2900, likely: 3000, high: 3100 }, proteinG: { low: 150, likely: 160, high: 170 }, fatG: { low: 70, likely: 80, high: 90 }, carbsG: { low: 350, likely: 385, high: 420 }, fiberG: { low: 25, likely: 30, high: 35 }, addedSugarG: { low: 0, likely: 0, high: 5 }, surplusKcal: 300 }, persisted: true });
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

  it("uses one full-shape meal read for confirmed totals and today's editable journal", async () => {
    const today = dateInTimezone("Europe/Paris");
    const meal = {
      id: "meal-today",
      userId: "user-1",
      mealDate: today,
      mealType: "lunch" as const,
      entryState: "recorded" as const,
      note: "Note conservée",
      status: "draft" as const,
      mouthWarmthIntensity: 2,
      stomachOverfullIntensity: 4,
      createdAt: "2026-09-25T12:00:00.000Z",
      updatedAt: "2026-09-25T12:00:00.000Z",
      photos: [{ id: "photo-today", mealId: "meal-today", origin: "homemade" as const, objectPath: "private/photo", mimeType: "image/jpeg", bytes: 1000, filename: "lunch.jpg", comment: "photo", createdAt: "2026-09-25T12:00:00.000Z", storageStatus: "available" as const, purgedAt: null }],
      analysis: null,
      lastSuccessfulAnalysis: null,
    };
    mocks.listMeals.mockResolvedValue([meal]);

    const { loadPersonalLabData } = await import("./personal-lab-data");
    const loaded = loadPersonalLabData("user-1", { includeAnalysis: false, periods: [90] });
    const [mealData, confirmedMeals, core] = await Promise.all([loaded.initialMealData, loaded.meals, loaded.core]);
    const admin = mocks.createCloudflareAdminClient.mock.results.at(-1)?.value;

    expect(mocks.listMeals).toHaveBeenCalledTimes(1);
    expect(mocks.listMeals).toHaveBeenCalledWith("user-1", { from: expect.any(String), to: today });
    expect(mealData).toMatchObject({ date: today, data: { date: today, meals: { lunch: {
      id: "meal-today",
      note: "Note conservée",
      photos: [{ id: "photo-today", filename: "lunch.jpg", origin: "homemade" }],
      mouthHeat: 2,
      stomachLoad: 4,
    } } } });
    expect(confirmedMeals).toEqual([]);
    expect(core.timeZone).toBe("Europe/Paris");
    expect(admin.from.mock.calls.map(([table]: [string]) => table)).not.toContain("provider_connections");
  });

  it("does not make overview core wait for optional provider connections", async () => {
    const admin = {
      from: vi.fn((table: string) => {
        const result = queryResult(table === "profiles" ? { timezone: "Europe/Paris" } : []);
        if (table === "provider_connections") {
          result.then = () => new Promise(() => undefined);
        }
        return result;
      }),
    };
    mocks.createCloudflareAdminClient.mockReturnValue(admin);
    const { loadPersonalLabData } = await import("./personal-lab-data");

    const loaded = loadPersonalLabData("user-1", { includeAnalysis: true, periods: [90] });
    await expect(loaded.core).resolves.toMatchObject({ timeZone: "Europe/Paris" });
    expect(admin.from.mock.calls.map(([table]: [string]) => table)).toContain("provider_connections");
  });

  it("keeps full meal history available to analysis when the requested period is all", async () => {
    const { loadPersonalLabData } = await import("./personal-lab-data");
    const loaded = loadPersonalLabData("user-1", { includeAnalysis: true, periods: ["all"] });

    await loaded.mealRows;
    expect(mocks.listMeals).toHaveBeenCalledWith("user-1", {});
  });

  it("does not turn a failed target read into a default automatic journal value", async () => {
    mocks.loadNutritionTargetsStateForUser.mockRejectedValue(new Error("target read unavailable"));
    const { loadPersonalLabData } = await import("./personal-lab-data");
    const loaded = loadPersonalLabData("user-1", { includeAnalysis: false, periods: [90] });

    await loaded.journal;
    const journalOptions = mocks.loadJournalData.mock.calls.at(-1)?.[1] as { dailyTargetKcal: Promise<number | null> };
    await expect(journalOptions.dailyTargetKcal).resolves.toBeNull();
    await expect(loaded.targetsState).resolves.toMatchObject({ fresh: false, persisted: false });
  });
});
