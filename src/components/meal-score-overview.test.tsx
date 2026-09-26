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

import { MealScoreHistoryPanel, MealScoreOverviewPanel } from "./meal-score-overview";

function completeComponent(key: MealBalanceComponentKey, score: number): MealBalanceComponent {
  return {
    key,
    label: {
      nutritionAdequacy: "Nutritional adequacy",
      foodQuality: "Food quality",
      sugarLoad: "Sugar & concentration",
      nova: "NOVA processing",
      positiveVariety: "Positive variety",
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
    observedValue: "observed",
    target: "Personal target",
    summary: "Dimension summary.",
    period: { from: "2026-08-19", to: "2026-09-15" },
    subcomponents: [{
      key: `${key}-detail`,
      label: "Sub-metric",
      score,
      rawScore: score,
      adjustedScore: score,
      weight: 100,
      value: score,
      target: "100",
      confidence: 1,
      status: "ready",
      summary: "Detail.",
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

    expect(html).toContain('aria-label="Dietary balance"');
    expect(html).toContain("Score unavailable");
    expect(html).toContain("Confidence");
    expect(html).not.toContain("Coverage");
    expect(html).toContain("No score history available.");
    expect(html).toContain("No observations");
    expect(html).not.toContain(">0%</dd>");
  });

  it("rend les cinq axes, leurs détails et les historiques sans ancienne dimension", () => {
    const html = renderToStaticMarkup(
      <MealScoreOverviewPanel
        daily={completeScore}
        rolling={[
          { days: 14, score: 68, observedDays: 8, readyDays: 5, totalDays: 14 },
          { days: 30, score: 70, observedDays: 12, readyDays: 7, totalDays: 30 },
        ]}
        trend={[
          { date: "2026-09-08", score: 61, dimensionScores: { nutritionAdequacy: 70 } },
          { date: "2026-09-09", score: null },
          { date: "2026-09-10", score: 72, dimensionScores: { nutritionAdequacy: 75 } },
        ]}
      />,
    );

    for (const label of ["Nutritional adequacy", "Food quality", "Sugar & concentration", "NOVA processing", "Positive variety"]) {
      expect(html.includes(label) || html.includes(label.replace("&", "&amp;"))).toBe(true);
    }
    expect(html).toContain("Contribution");
    expect(html).toContain("Dimension details");
    expect(html).toContain("30-day trend");
    expect(html).toContain("14-day average");
    expect(html).toContain("8 observed days");
    expect(html).toContain("30-day average");
    expect(html).toContain("30d avg 73%");
    expect(html).toContain("+2 pts vs avg");
    expect(html).toContain("12 observed days");
    expect(html.match(/role="button"/g)).toHaveLength(5);
    expect(html.match(/aria-controls="meal-score-dimension-detail"/g)).toHaveLength(5);
    expect(html).toContain('data-key="nutritionAdequacy"');
    expect(html).toContain("Dietary dimensions profile");
    expect(html).toContain('data-testid="meal-score-bar-chart"');
    expect(html).toContain("health-chart-average");
    expect(html).toContain("health-chart-average-label");
    expect(html).not.toContain("meal-score-line-point");
    expect(html).not.toContain("meal-score-line-segment");
    expect(html).toContain("65%");
    expect(html).not.toContain("Couverture nutritionnelle");
    expect(html).not.toContain("Exposition liquide / concentrée");
    expect(html).not.toContain("Ultra-transformation");
    expect(html).not.toContain("NaN");
  });

  it("montre les scores mesurés en barres et garde zéro distinct des jours absents", () => {
    const html = renderToStaticMarkup(<MealScoreOverviewPanel daily={completeScore} rolling={[]} trend={[
      { date: "2026-09-08", score: 61 },
      { date: "2026-09-09", score: 0 },
      { date: "2026-09-10", score: null },
      { date: "2026-09-11", score: 72 },
      { date: "2026-09-12", score: 74 },
    ]} />);

    expect(html).toContain('data-testid="meal-score-bar-chart"');
    expect((html.match(/class="health-chart-bar/g) ?? [])).toHaveLength(4);
    expect(html).toContain("Donnée absente");
    expect(html).toContain("health-chart-average-label");
    expect(html).not.toContain("NaN");
  });

  it("garde l’échelle de score bornée à 0–100", () => {
    const html = renderToStaticMarkup(<MealScoreOverviewPanel daily={completeScore} rolling={[]} trend={[
      { date: "2026-09-08", score: null },
      { date: "2026-09-09", score: 61 },
      { date: "2026-09-10", score: null },
      { date: "2026-09-11", score: null },
      { date: "2026-09-12", score: 72 },
      { date: "2026-09-13", score: null },
      { date: "2026-09-14", score: null },
    ]} />);

    expect(html).toMatch(/<b>100 pts<\/b>/);
    expect(html).toMatch(/<b>0 pts<\/b>/);
    expect(html).toContain('id="meal-score-trend-title"');
  });

  it("does not compare a raw dimension score when its adjusted value is unavailable", () => {
    const html = renderToStaticMarkup(<MealScoreOverviewPanel daily={completeScore} rolling={[]} trend={[
      { date: "2026-09-15", score: 70, dimensionScores: { nutritionAdequacy: 80 }, dimensionAdjustedScores: { nutritionAdequacy: null } },
    ]} />);

    expect(html).toContain("30-day average unavailable");
    expect(html).toContain("30d avg —");
  });

  it("shows a single observed score without filling missing dates with zero bars", () => {
    const html = renderToStaticMarkup(<MealScoreHistoryPanel trend={[
      { date: "2026-09-08", score: null },
      { date: "2026-09-09", score: 64 },
      { date: "2026-09-10", score: null },
    ]} />);

    expect((html.match(/class="health-chart-bar/g) ?? [])).toHaveLength(1);
    expect(html.match(/data-chart-hit-area/g) ?? []).toHaveLength(3);
    expect(html).toContain("health-chart-average-label");
    expect(html).toContain("Donnée absente");
    expect(html).not.toContain("bottom:0%");
  });
});
