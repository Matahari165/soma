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

  it("renders skipped meals as a calm reversible state without capture controls", () => {
    const meal: MealRecord = {
      id: "meal-breakfast-skipped",
      date: "2026-08-31",
      slot: "breakfast",
      note: "",
      photos: [],
      analysis: null,
      mouthHeat: null,
      stomachLoad: null,
      status: "confirmed",
      entryState: "skipped",
    };

    const html = renderToStaticMarkup(<LabMealCard
      meal={meal}
      slot="breakfast"
      saving={false}
      processingFiles={false}
      mutationBusy={false}
      onFiles={() => undefined}
      onRemovePhoto={() => undefined}
      onAnalyze={() => undefined}
      onCancelAnalysis={() => undefined}
      onNote={() => undefined}
      onMarkRecorded={() => undefined}
    />);

    expect(html).toContain("Skipped");
    expect(html).toContain("This slot is excluded from meal totals.");
    expect(html).toContain("Log this meal");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("Camera");
    expect(html).not.toContain("Photos");
    expect(html).not.toContain("Analyze meal");
  });

  it("renders a Modifier button on an analyzed meal", () => {
    const meal: MealRecord = {
      id: "meal-dinner-analyzed",
      date: "2026-08-31",
      slot: "dinner",
      note: "Poulet et légumes",
      photos: [],
      analysis: {
        dishType: "Poulet et légumes rôtis",
        ingredients: [],
        calories: { low: 400, likely: 500, high: 600 },
        proteinGrams: { low: 30, likely: 40, high: 50 },
        carbohydratesGrams: { low: 20, likely: 30, high: 40 },
        fatGrams: { low: 10, likely: 15, high: 20 },
        addedSugarGrams: { low: 0, likely: 0, high: 2 },
      },
      mouthHeat: null,
      stomachLoad: null,
      status: "confirmed",
    };

    const html = renderToStaticMarkup(<LabMealCard
      meal={meal}
      slot="dinner"
      targets={DEFAULT_NUTRITION_TARGETS}
      saving={false}
      processingFiles={false}
      mutationBusy={false}
      onFiles={() => undefined}
      onRemovePhoto={() => undefined}
      onAnalyze={() => undefined}
      onCancelAnalysis={() => undefined}
      onNote={() => undefined}
      onCorrection={() => undefined}
    />);

    expect(html).toContain("Modifier");
    expect(html).toContain('aria-label="Modifier Dinner"');
  });
});
