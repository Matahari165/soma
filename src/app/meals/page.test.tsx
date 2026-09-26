import { describe, expect, it, vi } from "vitest";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";

const state = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  listMealRecipes: vi.fn().mockResolvedValue([]),
  createAdmin: vi.fn(),
  listMeals: vi.fn(),
  loadConfirmedMealRecords: vi.fn(),
  loadActiveGoal: vi.fn().mockResolvedValue({ type: "general_fitness" }),
  loadTargets: vi.fn().mockResolvedValue({ targets: { caloriesKcal: { likely: 2000 } }, effectiveTargets: { caloriesKcal: { likely: 2200 } }, persisted: true, effortScore: 60, effortCoverage: 1, averageEffortScore: 40 }),
  mappedMeals: [] as Array<{ id: string; status: string }>,
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: state.getCurrentUser }));
vi.mock("@/lib/env", () => ({ isLocalPreviewMode: () => false }));
vi.mock("@/lib/cloudflare/db", () => ({ createCloudflareAdminClient: state.createAdmin }));
vi.mock("@/services/meals", () => ({ listMeals: state.listMeals, loadConfirmedMealRecords: state.loadConfirmedMealRecords }));
vi.mock("@/services/active-goals", () => ({ loadActiveGoal: state.loadActiveGoal }));
vi.mock("@/services/meal-api", () => ({ mealToApi: (meal: unknown) => meal }));
vi.mock("@/services/meal-recipes", () => ({
  listMealRecipes: state.listMealRecipes,
  MealRecipeServiceError: class MealRecipeServiceError extends Error {},
}));
vi.mock("@/services/nutrition-targets", () => ({ loadDailyNutritionTargetsForUser: state.loadTargets }));
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
vi.mock("@/components/meal-score-overview", () => ({ default: () => null, MealScoreHistoryPanel: () => null }));
vi.mock("@/components/meals-initial-load-error", () => ({ MealsInitialLoadError: () => null }));

import MealsPage from "./page";
import MealJournal from "@/components/meal-journal";

function findJournal(node: ReactNode): ReactElement<Record<string, unknown>> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode }>(child)) continue;
    if (child.type === MealJournal) return child as ReactElement<Record<string, unknown>>;
    const found = findJournal(child.props.children);
    if (found) return found;
  }
}

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
  it("starts the independent goal read while the profile is still pending", async () => {
    vi.clearAllMocks();
    state.getCurrentUser.mockResolvedValue({ id: "user-1" });
    let resolveProfile!: (value: { data: { timezone: string }; error: null }) => void;
    const profile = new Promise<{ data: { timezone: string }; error: null }>((resolve) => { resolveProfile = resolve; });
    state.createAdmin.mockReturnValue({ from: () => {
      const query = { select: () => query, eq: () => query, maybeSingle: () => profile };
      return query;
    } });
    state.listMeals.mockResolvedValue([]);
    state.loadConfirmedMealRecords.mockResolvedValue([]);
    state.listMealRecipes.mockResolvedValue([]);
    const page = await MealsPage({ searchParams: Promise.resolve({ date: "2026-09-15" }) });
    const content = (page as ReactElement<{ children: ReactElement }>).props.children;
    const renderContent = content.type as unknown as (props: typeof content.props) => Promise<ReactElement>;
    const rendering = renderContent(content.props);
    await vi.waitFor(() => expect(state.loadActiveGoal).toHaveBeenCalledWith("user-1"));
    expect(state.listMeals).not.toHaveBeenCalled();
    resolveProfile({ data: { timezone: "Europe/Paris" }, error: null });
    await rendering;
    expect(state.listMeals).toHaveBeenCalledWith("user-1", { from: "2026-08-17", to: "2026-09-15" });
  });

  it("shares the 30-day range and keeps only the requested date in the journal", async () => {
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
    // A pending recipe read must not prevent journal + score from rendering.
    state.listMealRecipes.mockReturnValue(new Promise(() => {}));

    const page = await MealsPage({ searchParams: Promise.resolve({ date: "2026-09-15" }) });
    const content = (page as ReactElement<{ children: ReactElement }>).props.children;
    const renderContent = content.type as unknown as (props: typeof content.props) => Promise<ReactElement>;
    const rendered = await renderContent(content.props);

    expect(state.listMeals).toHaveBeenCalledWith("user-1", { from: "2026-08-17", to: "2026-09-15" });
    expect(state.loadConfirmedMealRecords).toHaveBeenCalledWith("user-1", { from: "2026-08-17", to: "2026-09-15" });
    expect(state.mappedMeals).toEqual([
      { id: "current-draft", status: "draft" },
      { id: "current-confirmed", status: "confirmed" },
    ]);
    expect(findJournal(rendered)?.props).toMatchObject({
      date: "2026-09-15",
      initialTargets: { caloriesKcal: { likely: 2000 } },
      initialEffectiveTargets: { caloriesKcal: { likely: 2200 } },
      initialEffortTargetContext: { effortScore: 60, effortCoverage: 1, averageEffortScore: 40 },
      initialTargetsPersisted: true,
      initialTargetsFresh: true,
      initialTargetsDate: "2026-09-15",
    });
  });

  it("keeps client target recovery enabled when the server target read fails", async () => {
    state.getCurrentUser.mockResolvedValue({ id: "user-1" });
    state.listMeals.mockResolvedValue([]);
    state.loadConfirmedMealRecords.mockResolvedValue([]);
    state.loadTargets.mockRejectedValueOnce(new Error("unavailable"));
    const page = await MealsPage({ searchParams: Promise.resolve({ date: "2026-09-15" }) });
    const content = (page as ReactElement<{ children: ReactElement }>).props.children;
    const renderContent = content.type as unknown as (props: typeof content.props) => Promise<ReactElement>;
    const rendered = await renderContent(content.props);
    expect(findJournal(rendered)?.props).toMatchObject({ initialTargets: undefined, initialTargetsFresh: false, initialTargetsDate: undefined });
  });
});
