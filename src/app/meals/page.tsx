import type { Metadata } from "next";
import { Suspense } from "react";

import MealJournal from "@/components/meal-journal";
import { MealNutritionTrends } from "@/components/meal-nutrition-trends";
import { MealRecipeLibrary } from "@/components/meal-recipe-library";
import MealScoreOverviewPanel from "@/components/meal-score-overview";
import { MealsInitialLoadError } from "@/components/meals-initial-load-error";
import { LoadingSurface } from "@/components/loading-surface";
import { mealFoodGroupHistory, mealNutritionHistory } from "@/domain/lab/meals";
import { apiMealToRecord, MEAL_SLOTS, type MealJournalData } from "@/domain/meal-record";
import type { Meal } from "@/domain/meals";
import { mealRecipeToView, type MealRecipe } from "@/domain/meal-recipes";
import { buildMealScoreOverview } from "@/domain/scores/meal-overview";
import type { MealSlotState } from "@/domain/scores/meal-balance";
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
import { loadDailyNutritionTargetsForUser } from "@/services/nutrition-targets";
import { loadActiveGoal } from "@/services/active-goals";

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

function mealsForDate(meals: readonly Meal[], date: string) {
  return meals.filter((meal) => meal.mealDate === date);
}

function slotStatesByDate(meals: readonly Meal[]) {
  const states = new Map<string, Partial<Record<(typeof MEAL_SLOTS)[number], MealSlotState>>>();
  for (const meal of meals) {
    const bySlot = states.get(meal.mealDate) ?? {};
    const entryState = (meal as Meal & { entryState?: string }).entryState === "skipped" ? "skipped" : "recorded";
    bySlot[meal.mealType] = entryState;
    states.set(meal.mealDate, bySlot);
  }
  return states;
}

function goalMode(value: unknown): "build_muscle" | "maintain" {
  return value === "build_muscle" ? "build_muscle" : "maintain";
}

type MealsPageProps = { searchParams: Promise<{ date?: string | string[] }> };

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

async function MealsPageContent({ searchParams, user }: MealsPageProps & { user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>> }) {
  const params = await searchParams;
  let timeZone = "Europe/Paris";
  if (!isLocalPreviewMode()) {
    const profile = await createCloudflareAdminClient().from("profiles").select("timezone").eq("user_id", user.id).maybeSingle();
    timeZone = profile.data?.timezone ?? timeZone;
  }
  const today = todayIn(timeZone);
  const requestedDate = typeof params.date === "string" && isIsoDate(params.date) && params.date <= today ? params.date : today;
  const historyFrom = addDays(requestedDate, -27);

  const [mealResult, recipeResult, nutritionResult, targetsResult, goalResult] = await Promise.all([
    isLocalPreviewMode()
      ? loadSafely(() => listPreviewMeals(user.id, { from: historyFrom, to: requestedDate }))
      : loadSafely(() => listMeals(user.id, { from: historyFrom, to: requestedDate })),
    listMealRecipes(user.id)
      .then((value) => ({ recipes: value, error: undefined }))
      .catch((error) => ({
        recipes: [] as MealRecipe[],
        error: error instanceof MealRecipeServiceError
          ? error.message
          : "Personal recipes are temporarily unavailable.",
      })),
    isLocalPreviewMode()
      ? loadSafely(() => loadPreviewConfirmedMealRecords(user.id).filter((record) => record.mealDate >= historyFrom && record.mealDate <= requestedDate))
      : loadSafely(() => loadConfirmedMealRecords(user.id, { from: historyFrom, to: requestedDate })),
    loadSafely(() => loadDailyNutritionTargetsForUser(user.id, requestedDate)),
    loadSafely(async () => {
      if (isLocalPreviewMode()) return previewProfile.primaryGoal;
      return (await loadActiveGoal(user.id)).type;
    }),
  ]);

  const records = mealResult.ok ? mealsForDate(mealResult.value, requestedDate).map((meal) => apiMealToRecord(mealToApi(meal))) : [];
  const initialData: MealJournalData | null = mealResult.ok
    ? {
      date: requestedDate,
      meals: Object.fromEntries(MEAL_SLOTS.map((slot) => [slot, records.find((meal) => meal.slot === slot) ?? null])) as MealJournalData["meals"],
    }
    : null;
  const targets = targetsResult.ok ? targetsResult.value.targets : DEFAULT_NUTRITION_TARGETS;
  const effectiveTargets = targetsResult.ok ? targetsResult.value.effectiveTargets : targets;
  const statesByDate = mealResult.ok ? slotStatesByDate(mealResult.value) : undefined;
  const balanceOverview = nutritionResult.ok && goalResult.ok
    ? buildMealScoreOverview({ records: nutritionResult.value, targets: effectiveTargets, date: requestedDate, goalMode: goalMode(goalResult.value), slotStatesByDate: statesByDate })
    : null;
  const scoreTrend = (balanceOverview?.scoreTrend ?? []).map((point) => ({ date: point.date, score: point.balanceScore, rawScore: point.rawBalanceScore, status: point.balanceStatus, confidence: point.balanceConfidence, dimensionScores: point.dimensionScores, dimensionAdjustedScores: point.dimensionAdjustedScores }));

  return (
    <main id="main-page-content" className={`${styles.page} meals-page`} lang="en">
      <header className={styles.header}><h1>Nutrition</h1></header>
      <div className={styles.flow}>
        <MealScoreOverviewPanel
          daily={balanceOverview?.balanceScore ?? null}
          rolling={balanceOverview?.rolling ?? []}
          trend={scoreTrend}
          date={requestedDate}
          today={today}
          showHistory={false}
          className="meals-page-score"
        />
        {initialData ? (
          <section className={`${styles.journal} meals-page-journal`} aria-labelledby="meals-journal-title">
            <h2 id="meals-journal-title" className={styles.visuallyHidden}>Meal journal</h2>
            <MealJournal date={requestedDate} today={today} initialData={initialData} variant="lab" className="meal-journal-lab" historyDays={7} publishMealTotals readOnly />
          </section>
        ) : <MealsInitialLoadError kind="meals" />}
        {nutritionResult.ok
          ? <MealNutritionTrends
            metrics={mealNutritionHistory(nutritionResult.value, requestedDate)}
            foodGroups={mealFoodGroupHistory(nutritionResult.value, requestedDate, 30)}
            scoreTrend={scoreTrend}
            illustrative={isLocalPreviewMode()}
            className="meals-page-trends"
          />
          : <MealsInitialLoadError kind="nutrition" />}
        <MealRecipeLibrary initialRecipes={recipeResult.recipes.map(mealRecipeToView)} initialError={recipeResult.error} embedded className="meals-page-recipes" />
        <footer className={styles.provenance} aria-label="Nutrition data provenance">
          <h2 className={styles.visuallyHidden}>Provenance</h2>
          <p>Confirmed meals logged in Soma · Score and totals calculated by Soma from confirmed meals only</p>
          <p>Period from {formatShortDate(historyFrom)} to {formatShortDate(requestedDate)} · Unlogged days remain empty, never zero</p>
        </footer>
      </div>
    </main>
  );
}

export default async function MealsPage({ searchParams }: MealsPageProps) {
  const user = await getCurrentUser();
  if (!user) return <PublicHome />;

  return <Suspense fallback={<LoadingSurface eyebrow="Nutrition" title="Loading nutrition" label="Loading nutrition" variant="meals" />}><MealsPageContent searchParams={searchParams} user={user} /></Suspense>;
}
