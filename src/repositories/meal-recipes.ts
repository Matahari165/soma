import "server-only";

import { mealRecipeRecordSchema, type MealRecipe, type MealRecipeInput, type MealRecipeUpdate } from "@/domain/meal-recipes";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";

type MealRecipeRow = {
  id: string;
  user_id: string;
  name: string;
  dish_type?: unknown;
  description?: unknown;
  ingredients?: unknown;
  aliases?: unknown;
  common_variations?: unknown;
  is_active?: unknown;
  created_at: string;
  updated_at: string;
};

function jsonValue(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function rowToMealRecipe(row: MealRecipeRow): MealRecipe {
  return mealRecipeRecordSchema.parse({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    dishType: nullableString(row.dish_type),
    description: nullableString(row.description),
    ingredients: jsonValue(row.ingredients),
    aliases: jsonValue(row.aliases),
    commonVariations: jsonValue(row.common_variations),
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export async function listMealRecipes(userId: string, options: { includeInactive?: boolean } = {}) {
  let query = createCloudflareAdminClient()
    .from("meal_recipe_templates")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (!options.includeInactive) query = query.eq("is_active", true);
  const result = await query;
  if (result.error) throw new Error("Meal recipes could not be loaded.");
  return (result.data ?? []).map((row) => rowToMealRecipe(row as MealRecipeRow));
}

export async function findMealRecipe(userId: string, recipeId: string) {
  const result = await createCloudflareAdminClient()
    .from("meal_recipe_templates")
    .select("*")
    .eq("user_id", userId)
    .eq("id", recipeId)
    .maybeSingle();
  if (result.error) throw new Error("Meal recipe could not be loaded.");
  return result.data ? rowToMealRecipe(result.data as MealRecipeRow) : null;
}

export async function insertMealRecipe(userId: string, input: MealRecipeInput) {
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    user_id: userId,
    name: input.name,
    dish_type: input.dishType ?? null,
    description: input.description ?? null,
    ingredients: input.ingredients,
    aliases: input.aliases,
    common_variations: input.commonVariations,
    is_active: true,
    created_at: now,
    updated_at: now,
  };
  const result = await createCloudflareAdminClient()
    .from("meal_recipe_templates")
    .insert(row)
    .select("*")
    .single();
  if (result.error || !result.data) throw new Error("Meal recipe could not be saved.");
  return rowToMealRecipe(result.data as MealRecipeRow);
}

export async function updateMealRecipe(userId: string, recipeId: string, input: MealRecipeUpdate) {
  const values = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.dishType !== undefined ? { dish_type: input.dishType } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.ingredients !== undefined ? { ingredients: input.ingredients } : {}),
    ...(input.aliases !== undefined ? { aliases: input.aliases } : {}),
    ...(input.commonVariations !== undefined ? { common_variations: input.commonVariations } : {}),
  };
  const result = await createCloudflareAdminClient()
    .from("meal_recipe_templates")
    .update(values)
    .eq("user_id", userId)
    .eq("id", recipeId)
    .select("*")
    .maybeSingle();
  if (result.error) throw new Error("Meal recipe could not be updated.");
  return result.data ? rowToMealRecipe(result.data as MealRecipeRow) : null;
}

export async function deleteMealRecipe(userId: string, recipeId: string) {
  const result = await createCloudflareAdminClient()
    .from("meal_recipe_templates")
    .delete()
    .eq("user_id", userId)
    .eq("id", recipeId)
    .select("id")
    .maybeSingle();
  if (result.error) throw new Error("Meal recipe could not be deleted.");
  return Boolean(result.data);
}
