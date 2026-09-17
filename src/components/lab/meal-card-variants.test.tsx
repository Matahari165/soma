import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DEFAULT_NUTRITION_TARGETS } from "@/domain/nutrition-targets";
import type { MealRecord } from "@/domain/meal-record";
import { LabMealCard } from "./meal-card-variants";

describe("LabMealCard nutrition chart", () => {
  it("renders independent vertical meal targets for every nutrition metric", () => {
    const meal: MealRecord = {
      id: "meal-lunch-chart",
      date: "2026-08-31",
      slot: "lunch",
      note: "Rice and vegetables",
      photos: [],
      analysis: {
        dishType: "Rice and vegetables",
        ingredients: [],
        calories: { low: 1_100, likely: 1_200, high: 1_300 },
        proteinGrams: { low: 70, likely: 80, high: 90 },
        carbohydratesGrams: { low: 140, likely: 150, high: 160 },
        fatGrams: { low: 25, likely: 30, high: 35 },
        addedSugarGrams: { low: 1, likely: 2, high: 3 },
      },
      mouthHeat: null,
      stomachLoad: null,
      status: "confirmed",
    };

    const html = renderToStaticMarkup(<LabMealCard
      meal={meal}
      slot="lunch"
      targets={DEFAULT_NUTRITION_TARGETS}
      saving={false}
      processingFiles={false}
      mutationBusy={false}
      onFiles={() => undefined}
      onRemovePhoto={() => undefined}
      onAnalyze={() => undefined}
      onCancelAnalysis={() => undefined}
      onNote={() => undefined}
      onEdit={() => undefined}
    />);

    expect(html).toContain('class="_metricChart_');
    expect(html).toContain('data-metric="calories"');
    expect(html).toContain('data-metric="protein"');
    expect(html).toContain('data-metric="carbohydrates"');
    expect(html).toContain('data-metric="fat"');
    expect(html).toContain('data-metric="addedSugar"');
    expect(html).toContain("Target 1,200 kcal");
    expect(html).toContain("Target 64 g");
    expect(html).toContain('data-over-target="true"');
    expect(html).not.toContain('class="_metricBar_');
  });
});
