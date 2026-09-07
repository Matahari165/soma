import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DEFAULT_NUTRITION_TARGETS } from "../domain/nutrition-targets";
import { MealDayTargets } from "./meal-day-targets";

describe("MealDayTargets", () => {
  it("affiche 5 cartes avec des barres de progression", () => {
    const html = renderToStaticMarkup(
      <MealDayTargets
        totals={{ caloriesKcal: 3100, proteinG: 100, fiberG: 30, fatG: 80, carbsG: 500 }}
        targets={DEFAULT_NUTRITION_TARGETS}
      />,
    );

    for (const label of ["Calories", "Protéines", "Lipides", "Glucides", "Fibres"]) {
      expect(html).toContain(label);
    }
    for (const metric of ["calories", "protein", "fat", "carbs", "fiber"]) {
      expect(html).toContain(`data-metric="${metric}"`);
    }
    expect(html.match(/role="progressbar"/g)).toHaveLength(5);
    expect(html).not.toContain("Dans la cible");
    expect(html).not.toContain("En dessous");
    expect(html).not.toContain("Au-dessus");
    expect(html).toContain("aria-valuemin=\"0\"");
    expect(html).toContain("Cible 2900–3100 kcal");
  });

  it("ne transforme pas des totaux absents en zéro", () => {
    const html = renderToStaticMarkup(<MealDayTargets totals={null} targets={DEFAULT_NUTRITION_TARGETS} />);
    expect(html).not.toContain("En attente");
    expect(html).not.toContain("aria-valuenow");
    expect(html).not.toContain("Confirme des repas");
  });
});
