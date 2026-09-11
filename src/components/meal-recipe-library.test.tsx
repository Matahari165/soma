import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { MealRecipeView } from "@/domain/meal-recipes";

import { MealRecipeLibrary } from "./meal-recipe-library";

const recipe: MealRecipeView = {
  id: "recipe-1",
  name: "Pâtes au pesto",
  dishType: "Dîner",
  description: "La version habituelle, variable selon les courses.",
  ingredients: [{ name: "Pâtes", varietyKey: "complètes", usualAmount: "une portion", preparation: null, alternatives: ["riz"] }],
  aliases: ["pasta pesto"],
  commonVariations: ["avec poulet"],
  isActive: true,
  createdAt: "2026-09-06T12:00:00.000Z",
  updatedAt: "2026-09-06T12:00:00.000Z",
};

describe("MealRecipeLibrary", () => {
  it("explains the reference-only role and renders saved recipes", () => {
    const html = renderToStaticMarkup(createElement(MealRecipeLibrary, { initialRecipes: [recipe] }));

    expect(html).toContain("Recettes habituelles");
    expect(html).toContain("jamais une mesure du repas du jour");
    expect(html).toContain("Pâtes au pesto");
    expect(html).toContain("Pâtes · une portion");
    expect(html).toContain("Nouvelle recette");
  });

  it("opens an empty library with a first-recipe action", () => {
    const html = renderToStaticMarkup(createElement(MealRecipeLibrary, { initialRecipes: [] }));

    expect(html).toContain("Aucune recette enregistrée");
    expect(html).toContain("Ajouter le premier repère");
    expect(html).not.toContain("Décrire un plat récurrent");
  });

  it("keeps the compact day-priority explanation and a retryable loading error", () => {
    const html = renderToStaticMarkup(createElement(MealRecipeLibrary, {
      embedded: true,
      className: "meals-page-recipes",
      initialRecipes: [],
      initialError: "Le service des recettes est momentanément indisponible.",
    }));

    expect(html).toContain("Repères indicatifs : la photo et la note du jour priment.");
    expect(html).toContain("Recettes indisponibles");
    expect(html).toContain("Le service des recettes est momentanément indisponible.");
    expect(html).toContain("Réessayer");
    expect(html).toContain('role="alert" aria-live="assertive"');
    expect(html).not.toContain('role="alert" aria-live="polite"');
    expect(html).not.toContain("Nouvelle recette");
    expect(html).not.toContain("Aucune recette enregistrée");
  });
});
