import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MealsInitialLoadError } from "./meals-initial-load-error";

describe("MealsInitialLoadError", () => {
  it("explains that a meal load failure is not an empty day", () => {
    const html = renderToStaticMarkup(<MealsInitialLoadError kind="meals" />);

    expect(html).toContain('role="alert"');
    expect(html).toContain("Impossible de charger les repas");
    expect(html).toContain("ne sont pas disponibles");
    expect(html).toContain(">Réessayer</button>");
  });

  it("keeps a nutrition failure separate from the meal journal", () => {
    const html = renderToStaticMarkup(<MealsInitialLoadError kind="nutrition" />);

    expect(html).toContain("Historique nutritionnel indisponible");
    expect(html).toContain("Les repas restent disponibles");
  });
});
