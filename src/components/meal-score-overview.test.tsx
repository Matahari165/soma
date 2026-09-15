import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  MEAL_BALANCE_ALGORITHM_VERSION,
  MEAL_BALANCE_COMPONENT_ORDER,
  MEAL_BALANCE_NORMALIZED_COMPONENT_WEIGHTS,
  type MealBalanceComponent,
  type MealBalanceComponentKey,
  type MealBalanceScore,
} from "@/domain/scores/meal-balance";

import { MealScoreOverviewPanel } from "./meal-score-overview";

function completeComponent(key: MealBalanceComponentKey, score: number): MealBalanceComponent {
  return {
    key,
    label: {
      nutritionAdequacy: "Adéquation nutritionnelle",
      foodQuality: "Qualité alimentaire",
      sugarLoad: "Sucre et concentration",
      nova: "Transformation NOVA",
      positiveVariety: "Variété positive",
    }[key],
    score,
    rawScore: score,
    adjustedScore: score,
    weight: MEAL_BALANCE_NORMALIZED_COMPONENT_WEIGHTS[key],
    rawContribution: 1,
    contribution: 1,
    severityPenalty: 0,
    observationCoverage: 1,
    confidence: 1,
    status: "ready",
    observedValue: "observé",
    target: "Cible personnelle",
    summary: "Résumé de la dimension.",
    period: { from: "2026-08-19", to: "2026-09-15" },
    subcomponents: [{
      key: `${key}-detail`,
      label: "Sous-indicateur",
      score,
      rawScore: score,
      adjustedScore: score,
      weight: 100,
      value: score,
      target: "100",
      confidence: 1,
      status: "ready",
      summary: "Détail.",
    }],
  };
}

const completeScore: MealBalanceScore = {
  algorithmVersion: MEAL_BALANCE_ALGORITHM_VERSION,
  score: 72,
  rawScore: 73,
  status: "ready",
  confidence: 1,
  components: MEAL_BALANCE_COMPONENT_ORDER.map((key, index) => completeComponent(key, 65 + index * 5)),
  strongestEffects: [],
  reasons: [],
  observedDimensions: 5,
};

describe("MealScoreOverviewPanel", () => {
  it("présente un état vide sans transformer l'absence en zéro ni afficher de couverture", () => {
    const html = renderToStaticMarkup(<MealScoreOverviewPanel daily={null} rolling={[]} trend={[]} />);

    expect(html).toContain('aria-label="Équilibre alimentaire"');
    expect(html).toContain("Score indisponible");
    expect(html).toContain("Confiance");
    expect(html).not.toContain("Couverture");
    expect(html).toContain("Aucun historique de score disponible.");
    expect(html).toContain("Aucune moyenne disponible.");
    expect(html).not.toContain(">0 %</dd>");
  });

  it("rend les cinq axes, leurs détails et les historiques sans ancienne dimension", () => {
    const html = renderToStaticMarkup(
      <MealScoreOverviewPanel
        daily={completeScore}
        rolling={[
          { days: 14, score: 68, observedDays: 8, readyDays: 5, totalDays: 14 },
          { days: 28, score: 70, observedDays: 12, readyDays: 7, totalDays: 28 },
        ]}
        trend={[
          { date: "2026-09-08", score: 61, dimensionScores: { nutritionAdequacy: 70 } },
          { date: "2026-09-09", score: null },
          { date: "2026-09-10", score: 72, dimensionScores: { nutritionAdequacy: 75 } },
        ]}
      />,
    );

    for (const label of ["Adéquation nutritionnelle", "Qualité alimentaire", "Sucre et concentration", "Transformation NOVA", "Variété positive"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("Contribution");
    expect(html).toContain("Détails de la dimension");
    expect(html).toContain("Évolution sur 28 jours");
    expect(html).toContain("14 jours (8 observés)");
    expect(html).toContain("28 jours (12 observés)");
    expect(html.match(/role="button"/g)).toHaveLength(5);
    expect(html.match(/aria-controls="meal-score-dimension-detail"/g)).toHaveLength(5);
    expect(html).toContain('data-key="nutritionAdequacy"');
    expect(html).toContain("Profil des cinq dimensions de l’alimentation");
    expect(html).not.toContain("Couverture nutritionnelle");
    expect(html).not.toContain("Exposition liquide / concentrée");
    expect(html).not.toContain("Ultra-transformation");
    expect(html).not.toContain("NaN");
  });
});
