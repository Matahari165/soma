import { afterEach, describe, expect, it } from "vitest";

import { clearPreviewMealRecipes, createMealRecipe, deleteMealRecipe, findRelevantMealRecipeReferences, listMealRecipes, rankMealRecipeReferences, updateMealRecipe } from "./meal-recipes";

describe("personal meal recipe service", () => {
  afterEach(() => {
    delete process.env.SOMA_LOCAL_PREVIEW;
  });

  it("stores and updates a soft recipe reference in preview mode", async () => {
    process.env.SOMA_LOCAL_PREVIEW = "true";
    const userId = `recipe-user-${crypto.randomUUID()}`;
    const recipe = await createMealRecipe(userId, {
      name: "Pâtes du soir",
      dishType: "Pâtes",
      ingredients: [{ name: "Pâtes", usualAmount: "portion variable" }, { name: "Poulet", usualAmount: "un peu" }],
    });

    expect((await listMealRecipes(userId))).toHaveLength(1);
    expect(await updateMealRecipe(userId, recipe.id, { commonVariations: ["parfois avec pesto"] })).toMatchObject({ name: "Pâtes du soir", commonVariations: ["parfois avec pesto"] });
    expect(await findRelevantMealRecipeReferences(userId, { note: "Pâtes avec poulet" })).toMatchObject([{ name: "Pâtes du soir" }]);
    expect(await deleteMealRecipe(userId, recipe.id)).toBe(true);
    expect(await listMealRecipes(userId)).toEqual([]);
    clearPreviewMealRecipes(userId);
  });

  it("ranks aliases and ingredient matches without returning unrelated recipes", () => {
    const base = {
      id: "recipe-1",
      userId: "user-1",
      name: "Bowl habituel",
      dishType: "Bowl",
      description: null,
      ingredients: [{ name: "Riz", varietyKey: "riz", usualAmount: "variable", preparation: null, alternatives: [] }],
      aliases: ["bowl poulet"],
      commonVariations: [],
      isActive: true,
      createdAt: "2026-09-06T10:00:00.000Z",
      updatedAt: "2026-09-06T10:00:00.000Z",
    };
    expect(rankMealRecipeReferences([base], "Bowl poulet avec riz")).toHaveLength(1);
    expect(rankMealRecipeReferences([base], "crêpes")).toEqual([]);
  });
});
