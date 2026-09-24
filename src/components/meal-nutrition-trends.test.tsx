import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { MealNutritionTrendMetric } from "@/domain/lab/meals";

import { MealNutritionTrends } from "./meal-nutrition-trends";

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

describe("MealNutritionTrends", () => {
  it("renders the five daily nutrition metrics and period controls", () => {
    const html = renderToStaticMarkup(<MealNutritionTrends metrics={metrics} />);

    expect(html).toContain("Évolution nutritionnelle");
    expect(html).toContain("7 jours");
    expect(html).toContain("2 semaines");
    expect(html).toContain("1 mois");
    expect(html).toMatch(/aria-pressed="true"[^>]*>1 mois<\/button>/);
    expect(html.match(/data-metric=/g)).toHaveLength(5);
    expect(html).toContain("Calories");
    expect(html).toContain("Protéines");
    expect(html).toContain("Sucres ajoutés");
    expect(html).toContain("Lipides");
    expect(html).toContain("Glucides");
    expect(html).not.toContain("0/7 jours mesurés");
    expect(html).toContain("29 jours mesurés sur 30");
    expect(html).toContain("mercredi 26 août : aucune estimation disponible");
  });

  it("keeps an explicit zero distinct from an unmeasured day", () => {
    const zeroMetric: MealNutritionTrendMetric = {
      id: "proteinG",
      points: dates.map((date, index) => ({ date, value: index === 1 ? 0 : null })),
    };
    const html = renderToStaticMarkup(<MealNutritionTrends metrics={[zeroMetric]} />);

    expect(html).toContain("0 g");
    expect(html).toContain("1 jour mesuré sur 30");
    expect(html).toMatch(/class="[^"]*barMissing[^"]*"/);
    expect(html).toMatch(/class="[^"]*barZero[^"]*"/);
    expect(html).not.toContain("--bar-scale:0.04");
  });
});
