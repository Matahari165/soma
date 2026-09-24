import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MealFoodCategoryTrends } from "./meal-food-category-trends";

describe("MealFoodCategoryTrends", () => {
  it("shows an accessible empty state", () => {
    const html = renderToStaticMarkup(<MealFoodCategoryTrends points={[]} />);
    expect(html).toMatch(/<h2 id="meal-category-trends-title"[^>]*>Food group distribution<\/h2>/);
    expect(html).toContain("28 DAYS");
    expect(html).toContain("No data available");
  });

  it("does not turn an observed but unclassified period into an empty category", () => {
    const html = renderToStaticMarkup(<MealFoodCategoryTrends points={[
      { date: "2026-09-12", counts: null },
    ]} />);
    expect(html).toContain("No food groups classified");
    expect(html).not.toContain("Food group legend");
  });

  it("keeps missing days empty and exposes the crossed-family legend", () => {
    const html = renderToStaticMarkup(<MealFoodCategoryTrends points={[
      { date: "2026-09-11", counts: null },
      { date: "2026-09-12", counts: { fruit: 1, vegetable: 2, plant_protein: 1 } },
    ]} />);
    expect(html).toContain("Fruits");
    expect(html).toContain("Vegetables");
    expect(html).toContain("Plant protein");
    expect(html).toContain("Food groups may overlap");
    expect(html).toContain('role="img"');
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
