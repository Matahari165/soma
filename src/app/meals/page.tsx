import type { Metadata } from "next";

import MealJournal from "@/components/meal-journal";
import { MealRecipeLibrary } from "@/components/meal-recipe-library";
import { apiMealToRecord, MEAL_SLOTS, type MealJournalData } from "@/domain/meal-record";
import { mealRecipeToView, type MealRecipe } from "@/domain/meal-recipes";
import { PublicHome } from "@/components/public-home";
import { getCurrentUser } from "@/lib/auth";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { isLocalPreviewMode } from "@/lib/env";
import { mealToApi } from "@/services/meal-api";
import { listPreviewMeals } from "@/services/meal-preview";
import { listMealRecipes, MealRecipeServiceError } from "@/services/meal-recipes";
import { listMeals } from "@/services/meals";

export const metadata: Metadata = { title: { absolute: "Soma" } };

function isIsoDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function todayIn(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
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

  const [rawMeals, recipeResult] = await Promise.all([
    isLocalPreviewMode()
      ? listPreviewMeals(user.id, { from: requestedDate, to: requestedDate })
      : listMeals(user.id, { from: requestedDate, to: requestedDate }).catch(() => []),
    listMealRecipes(user.id)
      .then((value) => ({ recipes: value, error: undefined }))
      .catch((error) => ({
        recipes: [] as MealRecipe[],
        error: error instanceof MealRecipeServiceError
          ? error.message
          : "Les recettes personnelles sont momentanément indisponibles.",
      })),
  ]);

  const records = rawMeals.map((meal) => apiMealToRecord(mealToApi(meal)));
  const initialData: MealJournalData = {
    date: requestedDate,
    meals: Object.fromEntries(MEAL_SLOTS.map((slot) => [slot, records.find((meal) => meal.slot === slot) ?? null])) as MealJournalData["meals"],
  };

  return (
    <div id="main-page-content">
      <MealJournal date={requestedDate} today={today} initialData={initialData} />
      <MealRecipeLibrary initialRecipes={recipeResult.recipes.map(mealRecipeToView)} initialError={recipeResult.error} embedded />
    </div>
  );
}
