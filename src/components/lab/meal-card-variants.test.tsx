import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DEFAULT_NUTRITION_TARGETS } from "@/domain/nutrition-targets";
import type { MealRecord } from "@/domain/meal-record";
import { AnalysisDetails, LabMealCard } from "./meal-card-variants";

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
    expect(html).toContain("px-2.5 py-1 text-xs font-sans text-content-primary border border-hairline hover:border-hairline-light hover:bg-surface-elevated rounded transition-colors");
    expect(html).toContain("text-xs font-mono");
    expect(html).toContain("text-xs text-content-secondary leading-relaxed font-sans");
  });

  it("applies high-contrast buttons and harmonized typography on a pending meal card with canAnalyze", () => {
    const meal: MealRecord = {
      id: "meal-lunch-draft",
      date: "2026-08-31",
      slot: "lunch",
      note: "Avocado toast with eggs",
      photos: [],
      analysis: null,
      mouthHeat: null,
      stomachLoad: null,
      status: "draft",
    };

    const html = renderToStaticMarkup(<LabMealCard
      meal={meal}
      slot="lunch"
      saving={false}
      processingFiles={false}
      mutationBusy={false}
      onFiles={() => undefined}
      onRemovePhoto={() => undefined}
      onAnalyze={() => undefined}
      onCancelAnalysis={() => undefined}
      onNote={() => undefined}
      onMarkSkipped={() => undefined}
    />);

    // Analyze meal button when canAnalyze is true
    expect(html).toContain("!text-[#050505] !bg-[#f1f1f1] hover:!bg-white font-medium px-3.5 py-1.5 rounded transition-colors");
    // Camera and Photos buttons
    expect(html).toContain("px-2.5 py-1.5 text-xs font-sans text-content-primary border border-hairline hover:border-hairline-light hover:bg-surface-elevated rounded transition-colors");
    // Skip button
    expect(html).toContain("text-xs font-sans text-content-secondary hover:text-content-primary transition-colors");
    // Slot title
    expect(html).toContain("font-sans text-xs font-semibold uppercase tracking-wider text-content-primary");
  });

  it("applies explicit disabled styling on Analyze meal when cannot analyze", () => {
    const meal: MealRecord = {
      id: "meal-snack-empty",
      date: "2026-08-31",
      slot: "snack",
      note: "",
      photos: [],
      analysis: null,
      mouthHeat: null,
      stomachLoad: null,
      status: "draft",
    };

    const html = renderToStaticMarkup(<LabMealCard
      meal={meal}
      slot="snack"
      saving={false}
      processingFiles={false}
      mutationBusy={false}
      onFiles={() => undefined}
      onRemovePhoto={() => undefined}
      onAnalyze={() => undefined}
      onCancelAnalysis={() => undefined}
      onNote={() => undefined}
      onMarkSkipped={() => undefined}
    />);

    // Analyze meal button when canAnalyze is false
    expect(html).toContain("!bg-[#161616] !text-[#777777] border border-hairline cursor-not-allowed px-3.5 py-1.5 rounded text-xs");
    expect(html).toContain("disabled=\"\"");
  });

  it("removes Target text from pending meal card", () => {
    const meal: MealRecord = {
      id: "meal-dinner-pending",
      date: "2026-08-31",
      slot: "dinner",
      note: "Salmon and broccoli",
      photos: [],
      analysis: null,
      mouthHeat: null,
      stomachLoad: null,
      status: "draft",
    };

    const html = renderToStaticMarkup(<LabMealCard
      meal={meal}
      slot="dinner"
      saving={false}
      processingFiles={false}
      mutationBusy={false}
      onFiles={() => undefined}
      onRemovePhoto={() => undefined}
      onAnalyze={() => undefined}
      onCancelAnalysis={() => undefined}
      onNote={() => undefined}
    />);

    expect(html).not.toContain("Target: <");
    expect(html).not.toContain("Target:");
    expect(html).toContain("Dinner");
  });

  it("removes Confirmed badge from confirmed meal card while retaining meal time and Modifier button", () => {
    const meal: MealRecord = {
      id: "meal-breakfast-confirmed",
      date: "2026-08-31",
      slot: "breakfast",
      confirmedAt: "2026-08-31T08:30:00.000Z",
      note: "Avocado toast",
      photos: [],
      analysis: {
        dishType: "Avocado toast",
        ingredients: [{ id: "ing-1", name: "Avocado", portion: "1" }],
        calories: { low: 300, likely: 350, high: 400 },
        proteinGrams: { low: 8, likely: 10, high: 12 },
        carbohydratesGrams: { low: 30, likely: 35, high: 40 },
        fatGrams: { low: 18, likely: 20, high: 22 },
        addedSugarGrams: { low: 0, likely: 0, high: 1 },
      },
      mouthHeat: null,
      stomachLoad: null,
      status: "confirmed",
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
      onEdit={() => undefined}
    />);

    expect(html).not.toContain("Confirmed");
    expect(html).toContain("Modifier");
    expect(html).toContain("· ");
    expect(html).toContain("animate-fade-in");
    expect(html).toContain("active:scale-[0.98]");
  });

  it("renders Delete meal button in expanded AnalysisDetails when onDeleteMeal is provided", () => {
    const meal: MealRecord = {
      id: "meal-lunch-details",
      date: "2026-08-31",
      slot: "lunch",
      note: "Salade César",
      photos: [],
      analysis: {
        dishType: "Salade César",
        ingredients: [{ id: "ing-1", name: "Poulet", portion: "150g" }],
        calories: { low: 400, likely: 450, high: 500 },
        proteinGrams: { low: 30, likely: 35, high: 40 },
      },
      mouthHeat: null,
      stomachLoad: null,
      status: "confirmed",
    };

    const closedHtml = renderToStaticMarkup(
      <AnalysisDetails
        meal={meal}
        open={false}
        detailsId="test-details"
        variant="v1"
        onToggle={() => undefined}
        onDeleteMeal={() => undefined}
      />
    );
    expect(closedHtml).not.toContain("Delete meal");

    const openHtml = renderToStaticMarkup(
      <AnalysisDetails
        meal={meal}
        open={true}
        detailsId="test-details"
        variant="v1"
        onToggle={() => undefined}
        onDeleteMeal={() => undefined}
      />
    );
    expect(openHtml).toContain("Delete meal");
    expect(openHtml).toContain("text-signal-neg");
    expect(openHtml).toContain("transition-all duration-300 ease-out");
    expect(openHtml).toContain("active:scale-[0.98]");
  });

  it("sanitizes raw 'Fetch is aborted' error and renders a user-friendly timeout message", () => {
    const meal: MealRecord = {
      id: "meal-error-test",
      date: "2026-09-19",
      slot: "breakfast",
      note: "Simple text note",
      photos: [],
      analysis: null,
      mouthHeat: null,
      stomachLoad: null,
      status: "error",
      error: "Fetch is aborted",
    };

    const html = renderToStaticMarkup(
      <LabMealCard
        meal={meal}
        slot="breakfast"
        saving={false}
        processingFiles={false}
        mutationBusy={false}
        designVariant="v1"
        onFiles={() => undefined}
        onRemovePhoto={() => undefined}
        onAnalyze={() => undefined}
        onCancelAnalysis={() => undefined}
        onNote={() => undefined}
      />
    );

    expect(html).toContain("Analysis interrupted");
    expect(html).not.toContain("Fetch is aborted");
    expect(html).toContain("Analysis is taking longer than expected. Please try again in a few moments.");
    expect(html).toContain("Retry");
  });
});


