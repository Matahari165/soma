import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { MealNutritionTrendMetric } from "@/domain/lab/meals";

import { MealNutritionTrends } from "./meal-nutrition-trends";

const dates = [
  "2026-08-25",
  "2026-08-26",
  "2026-08-27",
  "2026-08-28",
  "2026-08-29",
  "2026-08-30",
  "2026-08-31",
];

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
    expect(html.match(/data-metric=/g)).toHaveLength(5);
    expect(html).toContain("Calories");
    expect(html).toContain("Protéines");
    expect(html).toContain("Sucres ajoutés");
    expect(html).toContain("Lipides");
    expect(html).toContain("Glucides");
    expect(html).toContain("0/7 jours mesurés");
    expect(html).toContain("mercredi 26 août : aucune estimation disponible");
  });

  it("keeps an explicit zero distinct from an unmeasured day", () => {
    const zeroMetric: MealNutritionTrendMetric = {
      id: "proteinG",
      points: dates.map((date, index) => ({ date, value: index === 1 ? 0 : null })),
    };
    const html = renderToStaticMarkup(<MealNutritionTrends metrics={[zeroMetric]} />);

    expect(html).toContain("0 g");
    expect(html).toContain("1/7 jours mesurés");
    expect(html).toMatch(/class="[^"]*barMissing[^"]*"/);
    expect(html).toMatch(/class="[^"]*bar[^"]*" style="--bar-scale:0\.04"/);
  });
});
