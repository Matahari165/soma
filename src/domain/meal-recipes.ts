import { z } from "zod";

/**
 * A personal recipe is a soft reference for recurring meals, not a measured
 * nutrition source. Amounts describe what is usual, never what was actually
 * eaten on a given day.
 */
export const mealRecipeIngredientSchema = z.object({
  name: z.string().trim().min(1).max(120),
  varietyKey: z.string().trim().min(1).max(80).nullable().optional(),
  usualAmount: z.string().trim().min(1).max(120).nullable().optional(),
  preparation: z.string().trim().min(1).max(240).nullable().optional(),
  alternatives: z.array(z.string().trim().min(1).max(120)).max(8).optional().default([]),
});
export type MealRecipeIngredient = z.infer<typeof mealRecipeIngredientSchema>;

export const mealRecipeInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  dishType: z.string().trim().min(1).max(80).nullable().optional(),
  description: z.string().trim().min(1).max(500).nullable().optional(),
  ingredients: z.array(mealRecipeIngredientSchema).max(30).optional().default([]),
  aliases: z.array(z.string().trim().min(1).max(80)).max(8).optional().default([]),
  commonVariations: z.array(z.string().trim().min(1).max(160)).max(8).optional().default([]),
});
export type MealRecipeInput = z.infer<typeof mealRecipeInputSchema>;

export const mealRecipeUpdateSchema = mealRecipeInputSchema.partial().refine((input) => Object.keys(input).length > 0, {
  message: "At least one recipe field is required.",
});
export type MealRecipeUpdate = z.infer<typeof mealRecipeUpdateSchema>;

export const mealRecipeRecordSchema = mealRecipeInputSchema.extend({
  id: z.string().trim().min(1).max(120),
  userId: z.string().trim().min(1).max(160),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type MealRecipe = z.infer<typeof mealRecipeRecordSchema>;
export type MealRecipeView = Omit<MealRecipe, "userId">;

/** Keep the account identifier on the server; it is not needed by the UI. */
export function mealRecipeToView(recipe: MealRecipe): MealRecipeView {
  const { userId, ...view } = recipe;
  void userId;
  return view;
}

/** Only the fields useful to the analyser are passed as optional context. */
export type MealRecipeReference = Pick<MealRecipe, "name" | "dishType" | "ingredients" | "aliases" | "commonVariations">;

export function mealRecipeToReference(recipe: MealRecipe): MealRecipeReference {
  return {
    name: recipe.name,
    dishType: recipe.dishType ?? null,
    ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient, alternatives: [...ingredient.alternatives] })),
    aliases: [...recipe.aliases],
    commonVariations: [...recipe.commonVariations],
  };
}
