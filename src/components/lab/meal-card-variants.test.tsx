import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DEFAULT_NUTRITION_TARGETS } from "@/domain/nutrition-targets";
import type { MealRecord } from "@/domain/meal-record";
import { AnalysisDetails, LabMealCard } from "./meal-card-variants";

describe("LabMealCard nutrition chart", () => {
  it("replaces the draft with one truthful analysis screen and updates its server stage", () => {
    const meal: MealRecord = { id: "meal-dinner", date: "2026-09-23", slot: "dinner", note: "Example dinner", photos: [], analysis: null, mouthHeat: null, stomachLoad: null, status: "accepted" };
    const props = { meal, slot: "dinner" as const, saving: false, processingFiles: false, mutationBusy: false, onFiles: () => undefined, onRemovePhoto: () => undefined, onAnalyze: () => undefined, onCancelAnalysis: () => undefined, onNote: () => undefined };
    const connecting = renderToStaticMarkup(<LabMealCard {...props} analysisProgress={{ stage: "connecting", foods: [] }} />);
    expect(connecting).toContain("Connexion au service");
    expect(connecting).toContain('aria-current="step"');
    expect(connecting).not.toContain("Example dinner");
    const analyzing = renderToStaticMarkup(<LabMealCard {...props} meal={{ ...meal, status: "analyzing" }} analysisProgress={{ stage: "analyzing", foods: [] }} />);
    expect(analyzing).toContain("Le repas est examiné");
    expect(analyzing).toContain("Annuler l’analyse");
    expect(analyzing).not.toContain("Example dinner");
  });

  it("explains a completed analysis without nutrition and exposes fiber and total sugar in details", () => {
    const unavailable = { low: null, likely: null, high: null };
    const meal: MealRecord = { id: "meal-dinner", date: "2026-09-23", slot: "dinner", note: "Example dinner", photos: [], analysis: { ingredients: [], summary: "Meal described", calories: unavailable, proteinGrams: unavailable }, mouthHeat: null, stomachLoad: null, status: "confirmed" };
    const props = { meal, slot: "dinner" as const, saving: false, processingFiles: false, mutationBusy: false, onFiles: () => undefined, onRemovePhoto: () => undefined, onAnalyze: () => undefined, onCancelAnalysis: () => undefined, onNote: () => undefined };
    expect(renderToStaticMarkup(<LabMealCard {...props} />)).toContain("Le résultat ne contient pas d’estimation nutritionnelle");
    const details = renderToStaticMarkup(<AnalysisDetails meal={meal} open detailsId="dinner-details" variant="v1" onToggle={() => undefined} hideToggle />);
    expect(details).toContain("Fibres");
    expect(details).toContain("Sucres totaux");
  });

  it("shows the analyzed meal immediately and keeps a comment for each draft photo", () => {
    const meal: MealRecord = { id: "meal-lunch", date: "2026-08-31", slot: "lunch", note: "Riz", photos: [{ id: "photo-one", url: "blob:one", origin: "homemade", comment: "Sauce à part" }], analysis: { ingredients: [], calories: { low: 200, likely: 250, high: 300 }, proteinGrams: { low: 5, likely: 8, high: 12 } }, mouthHeat: null, stomachLoad: null, status: "review" };
    const props = { meal, slot: "lunch" as const, saving: false, processingFiles: false, mutationBusy: false, onFiles: () => undefined, onRemovePhoto: () => undefined, onAnalyze: () => undefined, onCancelAnalysis: () => undefined, onNote: () => undefined, onPhotoComment: () => undefined };
    const review = renderToStaticMarkup(<LabMealCard {...props} onConfirm={() => undefined} />);
    expect(review).not.toContain("Valider le repas");
    expect(review).not.toContain("Confirm result");
    expect(review).toContain('aria-label="Added sugar">S</dt><dd>—</dd>');
    const failedConfirmation = renderToStaticMarkup(<LabMealCard {...props} meal={{ ...meal, error: "Confirmation indisponible" }} onConfirm={() => undefined} />);
    expect(failedConfirmation).toContain("Retry confirmation");
    const draft = renderToStaticMarkup(<LabMealCard {...props} meal={{ ...meal, analysis: null, status: "draft" }} />);
    expect(draft).toContain("Sauce à part");
    expect(draft).toContain("commentaire facultatif");
  });
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
    expect(html).not.toContain("This slot is excluded from meal totals.");
    expect(html).toContain("Log this meal");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("Camera");
    expect(html).not.toContain("Photos");
    expect(html).not.toContain("Analyze meal");
  });

  it("renders one disclosure control on an analyzed meal", () => {
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

    expect(html).toContain('aria-label="Déplier Dinner"');
    expect(html).toContain('aria-controls="meal-dinner-analysis-details"');
    expect(html).not.toContain("Modifier le repas");
    expect(html).not.toContain("Analysis details");
    expect(html).toContain('aria-label="Added sugar">S</dt><dd>0g</dd>');
    expect(html).toContain("text-xs font-mono");
    expect(html).not.toContain("Poulet et légumes rôtis</p>");
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

  it("removes the recording time while retaining the meal disclosure", () => {
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
    />);

    expect(html).not.toContain("Confirmed");
    expect(html).toContain('aria-label="Déplier Breakfast"');
    expect(html).not.toContain("08:30");
    expect(html).not.toContain("08:15");
    expect(html).toContain("animate-fade-in");
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

  it("keeps the home meal detail focused on portions without repeating the meal description", () => {
    const meal: MealRecord = {
      id: "meal-lunch-compact", date: "2026-08-31", slot: "lunch", note: "Poulet et riz au déjeuner", photos: [],
      analysis: {
        ingredients: [{ id: "food-1", name: "Poulet", portion: "140 g" }, { id: "food-2", name: "Riz", portion: "180 g" }],
        summary: "Poulet et riz au déjeuner", calorieAnalysis: "Environ 600 kcal, repas modéré.",
        calories: { low: 500, likely: 600, high: 700 }, proteinGrams: { low: 30, likely: 40, high: 50 },
      },
      mouthHeat: null, stomachLoad: null, status: "confirmed",
    };
    const html = renderToStaticMarkup(<AnalysisDetails meal={meal} open detailsId="compact-detail" variant="v1" hideToggle onToggle={() => undefined} onDeleteMeal={() => undefined} />);
    expect(html).toContain("Composition");
    expect(html).toContain("140 g");
    expect(html).toContain("180 g");
    expect(html).not.toContain("Poulet et riz au déjeuner");
    expect(html).not.toContain("Environ 600 kcal");
    expect(html).toContain("Supprimer le repas");

    const withContext = renderToStaticMarkup(<AnalysisDetails meal={{ ...meal, analysis: { ...meal.analysis!, summary: "La cuisson à l’huile reste incertaine." } }} open detailsId="context-detail" variant="v1" hideToggle onToggle={() => undefined} />);
    expect(withContext).toContain("La cuisson à l’huile reste incertaine.");

    const withOneRepeatedIngredient = renderToStaticMarkup(<AnalysisDetails meal={{ ...meal, analysis: { ...meal.analysis!, summary: "Poulet grillé à midi." } }} open detailsId="repeat-detail" variant="v1" hideToggle onToggle={() => undefined} />);
    expect(withOneRepeatedIngredient).not.toContain("Poulet grillé à midi.");

    const withAvailablePhoto = renderToStaticMarkup(<AnalysisDetails meal={{ ...meal, photos: [{ id: "photo-1", url: "blob:photo-1", origin: "homemade" }] }} open detailsId="photo-detail" variant="v1" hideToggle onToggle={() => undefined} />);
    expect(withAvailablePhoto).not.toContain("Photo analysée puis supprimée");
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
