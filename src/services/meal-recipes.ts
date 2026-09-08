import "server-only";

import {
  mealRecipeInputSchema,
  mealRecipeToReference,
  mealRecipeUpdateSchema,
  type MealRecipe,
  type MealRecipeInput,
  type MealRecipeReference,
  type MealRecipeUpdate,
} from "@/domain/meal-recipes";
import type { MealAnalysisCorrection } from "@/domain/meals";
import {
  deleteMealRecipe as deleteMealRecipeRow,
  findMealRecipe as findMealRecipeRow,
  insertMealRecipe,
  listMealRecipes as listMealRecipeRows,
  updateMealRecipe as updateMealRecipeRow,
} from "@/repositories/meal-recipes";
import { isLocalPreviewMode } from "@/lib/env";

export class MealRecipeServiceError extends Error {
  constructor(readonly code: "not_found" | "invalid" | "unavailable", message: string) {
    super(message);
    this.name = "MealRecipeServiceError";
  }
}

const previewRecipes = new Map<string, Map<string, MealRecipe>>();

function userPreviewRecipes(userId: string) {
  let recipes = previewRecipes.get(userId);
  if (!recipes) {
    recipes = new Map();
    previewRecipes.set(userId, recipes);
  }
  return recipes;
}

function cloneRecipe(recipe: MealRecipe): MealRecipe {
  return structuredClone(recipe);
}

function invalidInput() {
  return new MealRecipeServiceError("invalid", "La recette n’est pas valide.");
}

function parseRecipeInput(input: unknown): MealRecipeInput {
  const parsed = mealRecipeInputSchema.safeParse(input);
  if (!parsed.success) throw invalidInput();
  return parsed.data;
}

function parseRecipeUpdate(input: unknown): MealRecipeUpdate {
  const parsed = mealRecipeUpdateSchema.safeParse(input);
  if (!parsed.success) throw invalidInput();
  return parsed.data;
}

function searchKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .trim();
}

function tokens(value: string) {
  return [...new Set(searchKey(value).split(/[^a-z0-9]+/).filter((token) => token.length >= 2))];
}

function recipeSearchFields(recipe: MealRecipe) {
  return [
    recipe.name,
    recipe.dishType ?? "",
    recipe.description ?? "",
    ...recipe.aliases,
    ...recipe.commonVariations,
    ...recipe.ingredients.flatMap((ingredient) => [ingredient.name, ingredient.varietyKey ?? "", ...ingredient.alternatives]),
  ].map(searchKey).filter(Boolean);
}

function recipeMatchScore(recipe: MealRecipe, query: string) {
  const normalizedQuery = searchKey(query);
  if (!normalizedQuery) return 0;
  const fields = recipeSearchFields(recipe);
  const name = searchKey(recipe.name);
  const aliases = recipe.aliases.map(searchKey);
  let score = 0;
  if (normalizedQuery.includes(name)) score += 100;
  if (aliases.some((alias) => alias && normalizedQuery.includes(alias))) score += 80;
  for (const token of tokens(query)) {
    if (fields.some((field) => field === token || field.includes(token))) score += 12;
  }
  return score;
}

/**
 * Ranks personal recipes without pretending that a match proves what was in
 * today's meal. The caller decides whether these references should be shown
 * to the model or kept out when there is no useful textual signal.
 */
export function rankMealRecipeReferences(recipes: MealRecipe[], query: string, limit = 4): MealRecipeReference[] {
  return recipes
    .filter((recipe) => recipe.isActive)
    .map((recipe) => ({ recipe, score: recipeMatchScore(recipe, query) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || right.recipe.updatedAt.localeCompare(left.recipe.updatedAt))
    .slice(0, limit)
    .map((item) => mealRecipeToReference(item.recipe));
}

function duplicateName(recipes: MealRecipe[], name: string, ignoredId?: string) {
  const key = searchKey(name);
  return recipes.some((recipe) => recipe.id !== ignoredId && recipe.isActive && searchKey(recipe.name) === key);
}

export async function listMealRecipes(userId: string) {
  if (isLocalPreviewMode()) return [...userPreviewRecipes(userId).values()].map(cloneRecipe).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  try {
    return await listMealRecipeRows(userId);
  } catch {
    throw new MealRecipeServiceError("unavailable", "Les recettes personnelles sont momentanément indisponibles.");
  }
}

export async function findMealRecipe(userId: string, recipeId: string) {
  if (isLocalPreviewMode()) {
    const recipe = userPreviewRecipes(userId).get(recipeId);
    return recipe ? cloneRecipe(recipe) : null;
  }
  try {
    return await findMealRecipeRow(userId, recipeId);
  } catch {
    throw new MealRecipeServiceError("unavailable", "La recette personnelle est momentanément indisponible.");
  }
}

export async function createMealRecipe(userId: string, input: unknown) {
  const parsed = parseRecipeInput(input);
  const existing = await listMealRecipes(userId);
  if (duplicateName(existing, parsed.name)) throw new MealRecipeServiceError("invalid", "Une recette porte déjà ce nom.");
  if (isLocalPreviewMode()) {
    const now = new Date().toISOString();
    const recipe = { ...parsed, id: crypto.randomUUID(), userId, isActive: true, createdAt: now, updatedAt: now } satisfies MealRecipe;
    userPreviewRecipes(userId).set(recipe.id, recipe);
    return cloneRecipe(recipe);
  }
  try {
    return await insertMealRecipe(userId, parsed);
  } catch {
    throw new MealRecipeServiceError("unavailable", "La recette personnelle n’a pas pu être enregistrée.");
  }
}

export async function updateMealRecipe(userId: string, recipeId: string, input: unknown) {
  const parsed = parseRecipeUpdate(input);
  const existing = await findMealRecipe(userId, recipeId);
  if (!existing) throw new MealRecipeServiceError("not_found", "Recette personnelle introuvable.");
  const recipes = await listMealRecipes(userId);
  if (parsed.name !== undefined && duplicateName(recipes, parsed.name, recipeId)) throw new MealRecipeServiceError("invalid", "Une recette porte déjà ce nom.");
  if (isLocalPreviewMode()) {
    const updated = { ...existing, ...parsed, updatedAt: new Date().toISOString() } satisfies MealRecipe;
    userPreviewRecipes(userId).set(recipeId, updated);
    return cloneRecipe(updated);
  }
  try {
    return await updateMealRecipeRow(userId, recipeId, parsed);
  } catch {
    throw new MealRecipeServiceError("unavailable", "La recette personnelle n’a pas pu être modifiée.");
  }
}

export async function deleteMealRecipe(userId: string, recipeId: string) {
  if (isLocalPreviewMode()) {
    if (!userPreviewRecipes(userId).delete(recipeId)) throw new MealRecipeServiceError("not_found", "Recette personnelle introuvable.");
    return true;
  }
  try {
    const deleted = await deleteMealRecipeRow(userId, recipeId);
    if (!deleted) throw new MealRecipeServiceError("not_found", "Recette personnelle introuvable.");
    return true;
  } catch (error) {
    if (error instanceof MealRecipeServiceError) throw error;
    throw new MealRecipeServiceError("unavailable", "La recette personnelle n’a pas pu être supprimée.");
  }
}

export async function findRelevantMealRecipeReferences(userId: string, input: { note?: string | null; correction?: MealAnalysisCorrection | null } = {}) {
  const query = [
    input.note ?? "",
    input.correction ?? "",
  ].filter(Boolean).join(" ");
  if (!query.trim()) return [] as MealRecipeReference[];
  const recipes = await listMealRecipes(userId);
  return rankMealRecipeReferences(recipes, query);
}

export function clearPreviewMealRecipes(userId: string) {
  const count = userPreviewRecipes(userId).size;
  previewRecipes.delete(userId);
  return count;
}
