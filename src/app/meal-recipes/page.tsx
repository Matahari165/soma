import type { Metadata } from "next";

import { MealRecipeLibrary } from "@/components/meal-recipe-library";
import { PublicHome } from "@/components/public-home";
import { mealRecipeToView, type MealRecipe } from "@/domain/meal-recipes";
import { getCurrentUser } from "@/lib/auth";
import { listMealRecipes, MealRecipeServiceError } from "@/services/meal-recipes";

export const metadata: Metadata = { title: { absolute: "Soma" } };

export default async function MealRecipesPage() {
  const user = await getCurrentUser();
  if (!user) return <PublicHome />;

  let recipes: MealRecipe[] = [];
  let initialError: string | undefined;
  try {
    recipes = await listMealRecipes(user.id);
  } catch (error) {
    initialError = error instanceof MealRecipeServiceError
      ? error.message
      : "Les recettes personnelles sont momentanément indisponibles.";
  }

  return <div id="main-page-content"><MealRecipeLibrary initialRecipes={recipes.map(mealRecipeToView)} initialError={initialError} /></div>;
}
