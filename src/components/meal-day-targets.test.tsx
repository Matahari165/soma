import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DEFAULT_NUTRITION_TARGETS } from "../domain/nutrition-targets";
import { MealDayTargets } from "./meal-day-targets";

describe("MealDayTargets", () => {
  it("affiche 5 cartes avec progressbar et états en texte", () => {
    const html = renderToStaticMarkup(
      <MealDayTargets
        totals={{ caloriesKcal: 3100, proteinG: 100, fiberG: 30, fatG: 80, carbsG: 500 }}
        targets={DEFAULT_NUTRITION_TARGETS}
      />,
    );

    for (const label of ["Calories", "Protéines", "Lipides", "Glucides", "Fibres"]) {
      expect(html).toContain(label);
    }
    expect(html.match(/role="progressbar"/g)).toHaveLength(5);
    expect(html).toContain("Dans la cible");
    expect(html).toContain("En dessous");
    expect(html).toContain("Au-dessus");
    expect(html).toContain("aria-valuemin=\"0\"");
    expect(html).toContain("Cible 2900–3100 kcal");
  });

  it("affiche un état d’attente quand les totaux sont incomplets", () => {
    const html = renderToStaticMarkup(<MealDayTargets totals={null} targets={DEFAULT_NUTRITION_TARGETS} />);
    expect(html).toContain("En attente");
    expect(html).toContain("Confirme des repas");
  });
});
