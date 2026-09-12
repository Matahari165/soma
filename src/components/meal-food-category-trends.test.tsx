import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MealFoodCategoryTrends } from "./meal-food-category-trends";

describe("MealFoodCategoryTrends", () => {
  it("shows an accessible empty state", () => {
    const html = renderToStaticMarkup(<MealFoodCategoryTrends points={[]} />);
    expect(html).toContain("Répartition des familles");
    expect(html).toContain("Aucune période disponible");
  });

  it("does not turn an observed but unclassified period into an empty category", () => {
    const html = renderToStaticMarkup(<MealFoodCategoryTrends points={[
      { date: "2026-09-12", counts: null },
    ]} />);
    expect(html).toContain("Aucune famille alimentaire classée");
    expect(html).not.toContain("Légende des familles alimentaires");
  });

  it("keeps missing days empty and exposes the crossed-family legend", () => {
    const html = renderToStaticMarkup(<MealFoodCategoryTrends points={[
      { date: "2026-09-11", counts: null },
      { date: "2026-09-12", counts: { fruit: 1, vegetable: 2, plant_protein: 1 } },
    ]} />);
    expect(html).toContain("Fruits");
    expect(html).toContain("Légumes");
    expect(html).toContain("Protéines végétales");
    expect(html).toContain("Les familles peuvent se croiser");
    expect(html).toContain('role="img"');
  });
});
