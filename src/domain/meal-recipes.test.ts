import { describe, expect, it } from "vitest";

import { mealRecipeInputSchema, mealRecipeToReference } from "./meal-recipes";

describe("meal recipe references", () => {
  it("keeps usual amounts indicative instead of turning them into meal facts", () => {
    const recipe = mealRecipeInputSchema.parse({
      name: "Pâtes du soir",
      ingredients: [{ name: "Pâtes", usualAmount: "une portion variable", alternatives: ["penne"] }],
      commonVariations: ["avec sauce tomate ou pesto"],
    });

    expect(recipe.ingredients[0]).toMatchObject({ name: "Pâtes", usualAmount: "une portion variable", alternatives: ["penne"] });
    expect(recipe.ingredients[0]).not.toHaveProperty("grams");
  });

  it("passes only contextual recipe fields to the analyser", () => {
    const recipe = mealRecipeInputSchema.parse({ name: "Bowl habituel", description: "Base variable" });
    const record = { ...recipe, id: "recipe-1", userId: "user-1", isActive: true, createdAt: "2026-09-06T10:00:00.000Z", updatedAt: "2026-09-06T10:00:00.000Z" };
    expect(mealRecipeToReference(record)).toEqual({
      name: "Bowl habituel",
      dishType: null,
      ingredients: [],
      aliases: [],
      commonVariations: [],
    });
    expect(mealRecipeToReference(record)).not.toHaveProperty("id");
  });
});
