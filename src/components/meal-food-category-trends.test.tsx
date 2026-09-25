import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MealFoodCategoryTrends } from "./meal-food-category-trends";

describe("MealFoodCategoryTrends", () => {
  it("shows an accessible empty state", () => {
    const html = renderToStaticMarkup(<MealFoodCategoryTrends points={[]} />);
    expect(html).toMatch(/<h3[^>]*>Food group distribution<\/h3>/);
    expect(html).toContain("No data available");
  });

  it("does not turn an observed but unclassified period into an empty category", () => {
    const html = renderToStaticMarkup(<MealFoodCategoryTrends points={[
      { date: "2026-09-12", counts: null },
    ]} />);
    expect(html).toContain("No food groups classified over this period.");
    expect(html).not.toContain("Food group occurrence legend");
    expect(html).toContain("Donnée absente");
  });

  it("keeps missing days empty and exposes the crossed-family legend", () => {
    const html = renderToStaticMarkup(<MealFoodCategoryTrends points={[
      { date: "2026-09-11", counts: null },
      { date: "2026-09-12", counts: { fruit: 1, vegetable: 2, plant_protein: 1 } },
    ]} />);
    expect(html).toContain("Fruits");
    expect(html).toContain("Vegetables");
    expect(html).toContain("Plant protein");
    expect(html).toContain("groups may overlap");
    expect(html).toContain("not caloric share");
    expect(html).toContain('role="img"');
    expect(html).toContain('data-testid="meal-food-group-chart"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("Use the left and right arrow keys to move between dates.");
  });

  it("adds clearly labelled illustrative history only when requested", () => {
    const html = renderToStaticMarkup(<MealFoodCategoryTrends illustrative points={[
      { date: "2026-09-11", counts: null },
      { date: "2026-09-12", counts: null },
    ]} />);
    expect(html).toContain("ILLUSTRATIVE DATA");
    expect(html).toContain("Vegetables");
  });
});
