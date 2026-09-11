import type { Metadata } from "next";

import MealJournal from "@/components/meal-journal";
import { MealNutritionTrends } from "@/components/meal-nutrition-trends";
import { MealRecipeLibrary } from "@/components/meal-recipe-library";
import { MealsInitialLoadError } from "@/components/meals-initial-load-error";
import { mealNutritionHistory } from "@/domain/lab/meals";
import { apiMealToRecord, MEAL_SLOTS, type MealJournalData } from "@/domain/meal-record";
import { mealRecipeToView, type MealRecipe } from "@/domain/meal-recipes";
import { PublicHome } from "@/components/public-home";
import { getCurrentUser } from "@/lib/auth";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { isLocalPreviewMode } from "@/lib/env";
import { mealToApi } from "@/services/meal-api";
import { listPreviewMeals, loadPreviewConfirmedMealRecords } from "@/services/meal-preview";
import { listMealRecipes, MealRecipeServiceError } from "@/services/meal-recipes";
import { listMeals, loadConfirmedMealRecords } from "@/services/meals";

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

  const [mealResult, recipeResult, nutritionResult] = await Promise.all([
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
      ? loadSafely(() => loadPreviewConfirmedMealRecords(user.id).filter((record) => record.mealDate >= addDays(requestedDate, -29) && record.mealDate <= requestedDate))
      : loadSafely(() => loadConfirmedMealRecords(user.id, { from: addDays(requestedDate, -29), to: requestedDate })),
  ]);

  const records = mealResult.ok ? mealResult.value.map((meal) => apiMealToRecord(mealToApi(meal))) : [];
  const initialData: MealJournalData | null = mealResult.ok
    ? {
      date: requestedDate,
      meals: Object.fromEntries(MEAL_SLOTS.map((slot) => [slot, records.find((meal) => meal.slot === slot) ?? null])) as MealJournalData["meals"],
    }
    : null;

  return (
    <div id="main-page-content" className="meals-page" lang="fr">
      {initialData ? <MealJournal date={requestedDate} today={today} initialData={initialData} variant="meals" historyDays={6}>
        {nutritionResult.ok
          ? <MealNutritionTrends metrics={mealNutritionHistory(nutritionResult.value, requestedDate)} className="meals-page-trends" />
          : <MealsInitialLoadError kind="nutrition" />}
        <MealRecipeLibrary initialRecipes={recipeResult.recipes.map(mealRecipeToView)} initialError={recipeResult.error} embedded className="meals-page-recipes" />
      </MealJournal> : <MealsInitialLoadError kind="meals" />}
    </div>
  );
}
