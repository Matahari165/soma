import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBearerSessionUser } from "@/lib/cloudflare/session";
import { GET } from "./route";
import { aggregateConfirmedMeals, mealFoodGroupHistory, mealNutritionHistory } from "@/domain/lab/meals";
import { buildMealScoreOverview } from "@/domain/scores/meal-overview";
import { listMealRecipes } from "@/services/meal-recipes";
import { loadConfirmedMealRecords, listMeals } from "@/services/meals";
import { loadDailyNutritionTargetsForUser } from "@/services/nutrition-targets";
import { listSupplementDefinitions, listSupplementEntries } from "@/services/supplements";

vi.mock("@/lib/cloudflare/session", () => ({ getBearerSessionUser: vi.fn() }));
vi.mock("@/lib/env", () => ({ isLocalPreviewMode: vi.fn(() => true) }));
vi.mock("@/lib/local-preview", () => ({ previewProfile: { primaryGoal: "maintain_health" } }));
vi.mock("@/domain/lab/meals", () => ({
  aggregateConfirmedMeals: vi.fn(),
  mealFoodGroupHistory: vi.fn(),
  mealNutritionHistory: vi.fn(),
}));
vi.mock("@/domain/scores/meal-overview", () => ({ buildMealScoreOverview: vi.fn() }));
vi.mock("@/domain/meal-recipes", () => ({ mealRecipeToView: (recipe: unknown) => recipe }));
vi.mock("@/domain/supplements", () => ({
  supplementDefinitionToView: (definition: unknown) => definition,
  supplementEntryToView: (entry: unknown) => entry,
}));
vi.mock("@/services/meal-recipes", () => ({ listMealRecipes: vi.fn() }));
vi.mock("@/services/meals", () => ({ loadConfirmedMealRecords: vi.fn(), listMeals: vi.fn() }));
vi.mock("@/services/nutrition-targets", () => ({ loadDailyNutritionTargetsForUser: vi.fn() }));
vi.mock("@/services/supplements", () => ({
  listSupplementDefinitions: vi.fn(),
  listSupplementEntries: vi.fn(),
}));

const user = { id: "native-nutrition-user" };

describe("native nutrition API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBearerSessionUser).mockResolvedValue(user as never);
    vi.mocked(loadConfirmedMealRecords).mockResolvedValue([]);
    vi.mocked(listMeals).mockResolvedValue([]);
    vi.mocked(loadDailyNutritionTargetsForUser).mockResolvedValue({
      targets: {
        caloriesKcal: { low: 2_900, likely: 3_000, high: 3_100 },
        proteinG: { low: 150, likely: 160, high: 170 },
        fatG: { low: 70, likely: 80, high: 90 },
        carbsG: { low: 350, likely: 385, high: 420 },
        fiberG: { low: 25, likely: 30, high: 35 },
        addedSugarG: { low: 0, likely: 0, high: 5 },
        surplusKcal: 300,
        mealDistribution: { breakfast: 25, lunch: 40, snack: 0, dinner: 35 },
      },
      effectiveTargets: {
        caloriesKcal: { low: 2_900, likely: 3_000, high: 3_100 },
        proteinG: { low: 150, likely: 160, high: 170 },
        fatG: { low: 70, likely: 80, high: 90 },
        carbsG: { low: 350, likely: 385, high: 420 },
        fiberG: { low: 25, likely: 30, high: 35 },
        addedSugarG: { low: 0, likely: 0, high: 5 },
        surplusKcal: 300,
        mealDistribution: { breakfast: 25, lunch: 40, snack: 0, dinner: 35 },
      },
      persisted: true,
      effortScore: null,
      effortCoverage: null,
      averageEffortScore: null,
      effortThreshold: 40,
      effortSupplementKcal: 0,
      effortAdjustmentApplied: false,
    });
    vi.mocked(listSupplementDefinitions).mockResolvedValue([]);
    vi.mocked(listSupplementEntries).mockResolvedValue([]);
    vi.mocked(listMealRecipes).mockResolvedValue([]);
    vi.mocked(aggregateConfirmedMeals).mockReturnValue([{
      date: "2026-09-19",
      mealCount: 1,
      mealCoverage: 25,
      homemadeCount: 1,
      preparedCount: 0,
      mixedCount: 0,
      homemadeShare: 100,
      caloriesKcal: 0,
      proteinG: null,
      carbsG: null,
      fatG: null,
      fiberG: null,
      sugarG: null,
      addedSugarG: null,
      analysisCoverage: 0,
      analysisConfidence: null,
      foodVarietyCount: null,
      foodGroupCount: null,
      foodListCoverage: 0,
      foodGroupCounts: null,
      foodObservationCoverage: null,
      mouthHeatAverage: null,
      mouthHeatMaximum: null,
      stomachOverfullnessAverage: null,
      stomachOverfullnessMaximum: null,
    }]);
    vi.mocked(mealNutritionHistory).mockReturnValue([{ id: "caloriesKcal", points: [{ date: "2026-09-19", value: 0 }, { date: "2026-09-18", value: null }] }]);
    vi.mocked(mealFoodGroupHistory).mockReturnValue([{ date: "2026-09-19", counts: null }]);
    vi.mocked(buildMealScoreOverview).mockReturnValue({
      date: "2026-09-19",
      balanceScore: null,
      dimensionScores: {},
      trend: [],
      scoreTrend: [{ date: "2026-09-19", balanceScore: 0, rawBalanceScore: 0, balanceStatus: "limited", balanceConfidence: 0, dimensionScores: { nutritionAdequacy: 0, foodQuality: null }, dimensionAdjustedScores: { nutritionAdequacy: 0, foodQuality: null } }],
      rolling: [{ days: 14, score: 0, observedDays: 1, readyDays: 0, totalDays: 14 }, { days: 28, score: 0, observedDays: 1, readyDays: 0, totalDays: 28 }],
    });
  });

  it("keeps the bearer boundary and rejects a web cookie", async () => {
    vi.mocked(getBearerSessionUser).mockResolvedValue(null);
    const response = await GET(new Request("https://soma.example/api/native/v1/nutrition?date=2026-09-19", { headers: { cookie: "soma_session=web" } }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication required." });
    expect(loadConfirmedMealRecords).not.toHaveBeenCalled();
  });

  it("returns canonical score and trend sections without turning null into zero", async () => {
    const response = await GET(new Request("https://soma.example/api/native/v1/nutrition?date=2026-09-19&days=7", { headers: { authorization: "Bearer token" } }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.period).toEqual({ from: "2026-09-13", to: "2026-09-19", days: 7 });
    expect(body.daily).toMatchObject({ caloriesKcal: 0, proteinG: null, addedSugarG: null });
    expect(body.nutritionHistory[0].points).toEqual([
      { date: "2026-09-19", value: 0 },
      { date: "2026-09-18", value: null },
    ]);
    expect(body.foodGroupHistory).toEqual([{ date: "2026-09-19", counts: null }]);
    expect(body.scoreTrend[0]).toMatchObject({
      value: 0,
      rawValue: 0,
      dimensionScores: { nutritionAdequacy: 0, foodQuality: null },
      dimensionAdjustedScores: { nutritionAdequacy: 0, foodQuality: null },
    });
    expect(body.provenance).toMatchObject({ source: "confirmed_meals", calculation: "soma" });
    expect(body.errors).toEqual([]);
  });

  it("rejects an invalid requested date", async () => {
    const response = await GET(new Request("https://soma.example/api/native/v1/nutrition?date=not-a-date", { headers: { authorization: "Bearer token" } }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Expected a valid ISO date." });
  });
});
