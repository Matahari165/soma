import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const state = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  createAdmin: vi.fn(),
  listMeals: vi.fn(),
  loadConfirmedMealRecords: vi.fn(),
  mappedMeals: [] as Array<{ id: string; status: string }>,
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: state.getCurrentUser }));
vi.mock("@/lib/env", () => ({ isLocalPreviewMode: () => false }));
vi.mock("@/lib/cloudflare/db", () => ({ createCloudflareAdminClient: state.createAdmin }));
vi.mock("@/services/meals", () => ({ listMeals: state.listMeals, loadConfirmedMealRecords: state.loadConfirmedMealRecords }));
vi.mock("@/services/meal-api", () => ({ mealToApi: (meal: unknown) => meal }));
vi.mock("@/services/meal-recipes", () => ({
  listMealRecipes: vi.fn().mockResolvedValue([]),
  MealRecipeServiceError: class MealRecipeServiceError extends Error {},
}));
vi.mock("@/services/nutrition-targets", () => ({ loadDailyNutritionTargetsForUser: vi.fn().mockResolvedValue({ targets: {}, effectiveTargets: {} }) }));
vi.mock("@/services/supplements", () => ({ listSupplementDefinitions: vi.fn().mockResolvedValue([]), listSupplementEntries: vi.fn().mockResolvedValue([]) }));
vi.mock("@/services/meal-preview", () => ({ listPreviewMeals: vi.fn(), loadPreviewConfirmedMealRecords: vi.fn() }));
vi.mock("@/domain/meal-record", () => ({
  MEAL_SLOTS: ["breakfast", "lunch", "snack", "dinner"],
  apiMealToRecord: (meal: { id: string; mealType: string; status: string }) => {
    state.mappedMeals.push({ id: meal.id, status: meal.status });
    return { id: meal.id, slot: meal.mealType, status: meal.status };
  },
}));
vi.mock("@/domain/lab/meals", () => ({ mealFoodGroupHistory: vi.fn().mockReturnValue([]), mealNutritionHistory: vi.fn().mockReturnValue([]) }));
vi.mock("@/domain/scores/meal-overview", () => ({ buildMealScoreOverview: vi.fn().mockReturnValue({ balanceScore: null, rolling: [], scoreTrend: [] }) }));
vi.mock("@/domain/nutrition-targets", () => ({ DEFAULT_NUTRITION_TARGETS: {} }));
vi.mock("@/components/public-home", () => ({ PublicHome: () => null }));
vi.mock("@/components/meal-journal", () => ({ default: () => null }));
vi.mock("@/components/meal-food-category-trends", () => ({ default: () => null }));
vi.mock("@/components/meal-nutrition-trends", () => ({ MealNutritionTrends: () => null }));
vi.mock("@/components/meal-recipe-library", () => ({ MealRecipeLibrary: () => null }));
vi.mock("@/components/meal-score-overview", () => ({ default: () => null }));
vi.mock("@/components/meal-supplements", () => ({ default: () => null }));
vi.mock("@/components/meals-initial-load-error", () => ({ MealsInitialLoadError: () => null }));

import MealsPage from "./page";

function meal(id: string, mealDate: string, status: "draft" | "confirmed") {
  return {
    id,
    userId: "user-1",
    mealDate,
    mealType: "lunch",
    note: null,
    status,
    mouthWarmthIntensity: null,
    stomachOverfullIntensity: null,
    createdAt: `${mealDate}T12:00:00.000Z`,
    updatedAt: `${mealDate}T12:00:00.000Z`,
    photos: [],
    analysis: null,
  };
}

describe("MealsPage initial meal reads", () => {
  it("shares the 28-day range and keeps only the requested date in the journal", async () => {
    state.getCurrentUser.mockResolvedValue({ id: "user-1" });
    state.createAdmin.mockReturnValue({
      from: () => {
        const query = {
          select: () => query,
          eq: () => query,
          is: () => query,
          maybeSingle: async () => ({ data: { timezone: "Europe/Paris" }, error: null }),
        };
        return query;
      },
    });
    state.listMeals.mockResolvedValue([
      meal("current-draft", "2026-09-15", "draft"),
      meal("current-confirmed", "2026-09-15", "confirmed"),
      meal("older-confirmed", "2026-09-14", "confirmed"),
    ]);
    state.loadConfirmedMealRecords.mockResolvedValue([]);
    state.mappedMeals = [];

    const page = await MealsPage({ searchParams: Promise.resolve({ date: "2026-09-15" }) });
    const content = (page as ReactElement<{ children: ReactElement }>).props.children;
    const renderContent = content.type as unknown as (props: typeof content.props) => Promise<ReactElement>;
    await renderContent(content.props);

    expect(state.listMeals).toHaveBeenCalledWith("user-1", { from: "2026-08-19", to: "2026-09-15" });
    expect(state.loadConfirmedMealRecords).toHaveBeenCalledWith("user-1", { from: "2026-08-19", to: "2026-09-15" });
    expect(state.mappedMeals).toEqual([
      { id: "current-draft", status: "draft" },
      { id: "current-confirmed", status: "confirmed" },
    ]);
  });
});
