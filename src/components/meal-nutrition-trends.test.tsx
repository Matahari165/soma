import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { MealFoodGroupTrendPoint, MealNutritionTrendMetric } from "@/domain/lab/meals";

import { limitMealTrendPoints, MealNutritionTrends } from "./meal-nutrition-trends";

const dates = Array.from({ length: 30 }, (_, index) =>
  new Date(Date.UTC(2026, 7, 25 + index)).toISOString().slice(0, 10),
);

const metrics: MealNutritionTrendMetric[] = [
  { id: "caloriesKcal", points: dates.map((date, index) => ({ date, value: index === 1 ? null : 500 + index * 100 })) },
  { id: "proteinG", points: dates.map((date) => ({ date, value: 25 })) },
  { id: "addedSugarG", points: dates.map((date) => ({ date, value: null })) },
  { id: "fatG", points: dates.map((date) => ({ date, value: 15 })) },
  { id: "carbsG", points: dates.map((date) => ({ date, value: 50 })) },
];

const foodGroups: MealFoodGroupTrendPoint[] = dates.map((date, index) => ({
  date,
  counts: index === 0 ? null : { vegetable: index },
}));

const scoreTrend = dates.slice(-28).map((date, index) => ({
  date,
  score: index % 3 === 0 ? null : index * 3,
}));

describe("MealNutritionTrends", () => {
  it("renders one shared period control above macro, food-group and score charts", () => {
    const html = renderToStaticMarkup(<MealNutritionTrends metrics={metrics} foodGroups={foodGroups} scoreTrend={scoreTrend} />);

    expect(html).toContain("Nutrition trends");
    expect(html).toContain("7 jours");
    expect(html).toContain("2 semaines");
    expect(html).toContain("1 mois");
    expect(html).toMatch(/aria-pressed="true"[^>]*>1 mois<\/button>/);
    expect(html.match(/data-metric=/g)).toHaveLength(5);
    expect(html.match(/aria-label="Choose chart period"/g)).toHaveLength(1);
    expect(html).toContain("Calories");
    expect(html).toContain("Protéines");
    expect(html).toContain("Sucres ajoutés");
    expect(html).toContain("Lipides");
    expect(html).toContain("Glucides");
    expect(html).not.toContain("0/7 jours mesurés");
    expect(html).toContain("29 jours mesurés sur 30");
    expect(html).toContain("mercredi 26 août : aucune estimation disponible");
    expect(html).toContain("Food group distribution");
    expect(html).toContain("Classified occurrences");
    expect(html).toContain("Nutrition score trend");
    expect(html).toContain("health-chart-average-label");
    expect(html).toMatch(/<b>100 pts<\/b>/);
    expect(html).toMatch(/<b>0 pts<\/b>/);
    expect(html.indexOf("Choose chart period")).toBeLessThan(html.indexOf("Nutrition score trend"));
  });

  it("keeps an explicit zero distinct from an unmeasured day", () => {
    const zeroMetric: MealNutritionTrendMetric = {
      id: "proteinG",
      points: dates.map((date, index) => ({ date, value: index === 1 ? 0 : null })),
    };
    const html = renderToStaticMarkup(<MealNutritionTrends metrics={[zeroMetric]} foodGroups={[]} scoreTrend={[]} />);

    expect(html).toContain("0 g");
    expect(html).toContain("1 jour mesuré sur 30");
    expect((html.match(/class="health-chart-bar/g) ?? [])).toHaveLength(1);
    expect(html).toContain("Donnée absente");
    expect(html.match(/data-chart-hit-area/g) ?? []).toHaveLength(30);
  });

  it("limits every chart to the same requested calendar window without filling absent data", () => {
    expect(limitMealTrendPoints(foodGroups, 7)).toEqual(foodGroups.slice(-7));
    expect(limitMealTrendPoints(foodGroups, 14)).toEqual(foodGroups.slice(-14));
    expect(limitMealTrendPoints(foodGroups, 30)).toEqual(foodGroups);
    expect(limitMealTrendPoints(foodGroups, 7)[0]?.counts).toEqual({ vegetable: 23 });
  });

  it("keeps food-group and score charts visible when macro series are unavailable", () => {
    const html = renderToStaticMarkup(<MealNutritionTrends
      metrics={[]}
      foodGroups={[{ date: "2026-09-24", counts: null }]}
      scoreTrend={[{ date: "2026-09-24", score: null }]}
    />);

    expect(html).toContain("Food group distribution");
    expect(html).toContain("Nutrition score trend");
    expect(html).not.toContain('data-metric=');
  });
});
