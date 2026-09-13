import type { Metadata } from "next";

import MealJournal from "@/components/meal-journal";
import MealFoodCategoryTrends from "@/components/meal-food-category-trends";
import { MealNutritionTrends } from "@/components/meal-nutrition-trends";
import { MealRecipeLibrary } from "@/components/meal-recipe-library";
import MealScoreOverviewPanel from "@/components/meal-score-overview";
import MealSupplements from "@/components/meal-supplements";
import { MealsInitialLoadError } from "@/components/meals-initial-load-error";
import { mealFoodGroupHistory, mealNutritionHistory } from "@/domain/lab/meals";
import { apiMealToRecord, MEAL_SLOTS, type MealJournalData } from "@/domain/meal-record";
import { mealRecipeToView, type MealRecipe } from "@/domain/meal-recipes";
import { supplementDefinitionToView, supplementEntryToView } from "@/domain/supplements";
import { buildMealScoreOverview } from "@/domain/scores/meal-overview";
import { DEFAULT_NUTRITION_TARGETS } from "@/domain/nutrition-targets";
import { PublicHome } from "@/components/public-home";
import { getCurrentUser } from "@/lib/auth";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { isLocalPreviewMode } from "@/lib/env";
import { previewProfile } from "@/lib/local-preview";
import { mealToApi } from "@/services/meal-api";
import { listPreviewMeals, loadPreviewConfirmedMealRecords } from "@/services/meal-preview";
import { listMealRecipes, MealRecipeServiceError } from "@/services/meal-recipes";
import { listMeals, loadConfirmedMealRecords } from "@/services/meals";
import { loadNutritionTargetsForUser } from "@/services/nutrition-targets";
import { listSupplementDefinitions, listSupplementEntries } from "@/services/supplements";

import styles from "./meals-page.module.css";

export const metadata: Metadata = { title: { absolute: "Soma" } };

type LoadResult<T> = { ok: true; value: T } | { ok: false };

async function loadSafely<T>(load: () => T | PromiseLike<T>): Promise<LoadResult<T>> {
  try {
    return { ok: true, value: await load() };
  } catch {
    return { ok: false };
  }
}

function isIsoDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function todayIn(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function goalMode(value: unknown): "build_muscle" | "maintain" {
  return value === "build_muscle" ? "build_muscle" : "maintain";
}

export default async function MealsPage({ searchParams }: { searchParams: Promise<{ date?: string | string[] }> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user) return <PublicHome />;
  let timeZone = "Europe/Paris";
  if (!isLocalPreviewMode()) {
    const profile = await createCloudflareAdminClient().from("profiles").select("timezone").eq("user_id", user.id).maybeSingle();
    timeZone = profile.data?.timezone ?? timeZone;
  }
  const today = todayIn(timeZone);
  const requestedDate = typeof params.date === "string" && isIsoDate(params.date) && params.date <= today ? params.date : today;

  const [mealResult, recipeResult, nutritionResult, targetsResult, goalResult, supplementDefinitionsResult, supplementEntriesResult] = await Promise.all([
    isLocalPreviewMode()
      ? loadSafely(() => listPreviewMeals(user.id, { from: requestedDate, to: requestedDate }))
      : loadSafely(() => listMeals(user.id, { from: requestedDate, to: requestedDate })),
    listMealRecipes(user.id)
      .then((value) => ({ recipes: value, error: undefined }))
      .catch((error) => ({
        recipes: [] as MealRecipe[],
        error: error instanceof MealRecipeServiceError
          ? error.message
          : "Les recettes personnelles sont momentanément indisponibles.",
      })),
    isLocalPreviewMode()
      ? loadSafely(() => loadPreviewConfirmedMealRecords(user.id).filter((record) => record.mealDate >= addDays(requestedDate, -27) && record.mealDate <= requestedDate))
      : loadSafely(() => loadConfirmedMealRecords(user.id, { from: addDays(requestedDate, -27), to: requestedDate })),
    loadSafely(() => loadNutritionTargetsForUser(user.id)),
    loadSafely(async () => {
      if (isLocalPreviewMode()) return previewProfile.primaryGoal;
      const result = await createCloudflareAdminClient().from("health_goals").select("goal_type").eq("user_id", user.id).eq("priority", 1).is("ended_on", null).maybeSingle();
      if (result.error) throw new Error("The nutrition goal could not be loaded.");
      return result.data?.goal_type;
    }),
    loadSafely(() => listSupplementDefinitions(user.id)),
    loadSafely(() => listSupplementEntries(user.id, { from: requestedDate, to: requestedDate })),
  ]);

  const records = mealResult.ok ? mealResult.value.map((meal) => apiMealToRecord(mealToApi(meal))) : [];
  const initialData: MealJournalData | null = mealResult.ok
    ? {
      date: requestedDate,
      meals: Object.fromEntries(MEAL_SLOTS.map((slot) => [slot, records.find((meal) => meal.slot === slot) ?? null])) as MealJournalData["meals"],
    }
    : null;
  const targets = targetsResult.ok ? targetsResult.value : DEFAULT_NUTRITION_TARGETS;
  const balanceOverview = nutritionResult.ok
    ? buildMealScoreOverview({ records: nutritionResult.value, targets, date: requestedDate, goalMode: goalMode(goalResult.ok ? goalResult.value : null) })
    : null;
  const supplementDefinitions = supplementDefinitionsResult.ok ? supplementDefinitionsResult.value.map(supplementDefinitionToView) : [];
  const supplementEntries = supplementEntriesResult.ok ? supplementEntriesResult.value.map(supplementEntryToView) : [];
  const supplementError = !supplementDefinitionsResult.ok || !supplementEntriesResult.ok ? "Les compléments sont momentanément indisponibles." : null;

  return (
    <main id="main-page-content" className={`${styles.page} meals-page`} lang="fr">
      <header className={styles.header}><h1>Alimentation</h1></header>
      <div className={styles.flow}>
        <MealScoreOverviewPanel
          daily={balanceOverview?.balanceScore ?? null}
          rolling={balanceOverview?.rolling ?? []}
          trend={(balanceOverview?.scoreTrend ?? []).map((point) => ({ date: point.date, score: point.balanceScore }))}
          className="meals-page-score"
        />
        {initialData ? (
          <section className={styles.journal} aria-labelledby="meals-journal-title">
            <h2 id="meals-journal-title">Journal des repas</h2>
            <MealJournal date={requestedDate} today={today} initialData={initialData} variant="lab" className="meal-journal-lab" historyDays={7} publishMealTotals hideAddMealButton />
          </section>
        ) : <MealsInitialLoadError kind="meals" />}
        {nutritionResult.ok
          ? <>
            <MealFoodCategoryTrends illustrative={isLocalPreviewMode()} points={mealFoodGroupHistory(nutritionResult.value, requestedDate)} className="meals-page-categories" />
            <MealNutritionTrends metrics={mealNutritionHistory(nutritionResult.value, requestedDate)} className="meals-page-trends" />
          </>
          : <MealsInitialLoadError kind="nutrition" />}
        <MealSupplements date={requestedDate} initialDefinitions={supplementDefinitions} initialEntries={supplementEntries} initialError={supplementError} className="meals-page-supplements" />
        <MealRecipeLibrary initialRecipes={recipeResult.recipes.map(mealRecipeToView)} initialError={recipeResult.error} embedded className="meals-page-recipes" />
      </div>
    </main>
  );
}
