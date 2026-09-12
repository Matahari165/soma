import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { MealBalanceScore } from "@/domain/scores/meal-balance";

import { MealScoreOverviewPanel } from "./meal-score-overview";

const completeScore: MealBalanceScore = {
  algorithmVersion: "meal-balance-v1",
  score: 72,
  status: "limited",
  coverage: 0.86,
  confidence: 0.74,
  components: [
    { key: "variety", label: "Variété", score: 84, weight: 15, effectiveWeight: 15, contribution: 12.6, observationCoverage: 1, confidence: 1, status: "ready", observedValue: "6 aliments · 4 groupes", target: "Diversité progressive", summary: "La variété observée est bien distribuée." },
    { key: "foodQuality", label: "Qualité alimentaire", score: 78, weight: 15, effectiveWeight: 11.7, contribution: 9.13, observationCoverage: 0.78, confidence: 1, status: "limited", observedValue: "75 % décrits", target: "Propriétés qualitatives observées", summary: "Les propriétés disponibles décrivent les aliments." },
    { key: "addedSugar", label: "Sucre ajouté", score: null, weight: 15, effectiveWeight: 0, contribution: 0, observationCoverage: 0, confidence: 0, status: "insufficient", observedValue: null, target: null, summary: "Aucune observation exploitable pour cette dimension." },
    { key: "sugarExposure", label: "Exposition liquide / concentrée", score: 65, weight: 12, effectiveWeight: 7.8, contribution: 5.07, observationCoverage: 0.65, confidence: 1, status: "limited", observedValue: "1 liquide · 0 concentré", target: "Limiter les expositions", summary: "Une exposition liquide a été observée." },
    { key: "ultraProcessing", label: "Ultra-transformation", score: 70, weight: 13, effectiveWeight: 13, contribution: 9.1, observationCoverage: 1, confidence: 1, status: "ready", observedValue: "2,1", target: "NOVA 1–3", summary: "Les aliments sans étiquette restent inconnus." },
    { key: "nutritionCoverage", label: "Couverture nutritionnelle", score: 81, weight: 15, effectiveWeight: 12.15, contribution: 9.84, observationCoverage: 0.81, confidence: 1, status: "limited", observedValue: 81, target: "Cinq dimensions de base", summary: "La couverture nutritionnelle est partielle." },
    { key: "energy", label: "Énergie", score: 76, weight: 15, effectiveWeight: 11.4, contribution: 8.66, observationCoverage: 0.76, confidence: 1, status: "limited", observedValue: 3000, target: "2900–3100 kcal", summary: "La zone utile est un plateau." },
  ],
  strongestEffects: [
    { key: "variety", label: "Variété", direction: "positive", points: 84, summary: "La diversité observée est bien distribuée." },
    { key: "sugarExposure", label: "Exposition liquide / concentrée", direction: "negative", points: 34, summary: "Une exposition liquide a été observée." },
  ],
  reasons: ["Variété : La diversité observée est bien distribuée."],
};

describe("MealScoreOverviewPanel", () => {
  it("présente un état vide explicite sans transformer l'absence en zéro", () => {
    const html = renderToStaticMarkup(<MealScoreOverviewPanel daily={null} rolling={[]} trend={[]} />);

    expect(html).toContain("Équilibre alimentaire");
    expect(html).toContain("Score indisponible");
    expect(html).toContain("Couverture");
    expect(html).toContain("Confiance");
    expect(html).toContain("Aucun historique de score disponible.");
    expect(html).not.toContain(">0 %</dd>");
  });

  it("rend le score complet, les sept dimensions, pondérations et contributions", () => {
    const html = renderToStaticMarkup(
      <MealScoreOverviewPanel
        daily={completeScore}
        rolling={[
          { days: 14, score: 68, coveredDays: 10, observedDays: 8, totalDays: 14 },
          { days: 28, score: null, coveredDays: 18, observedDays: 12, totalDays: 28 },
        ]}
        trend={[
          { date: "2026-09-08", score: 61 },
          { date: "2026-09-09", score: null },
          { date: "2026-09-10", score: 72 },
        ]}
      />,
    );

    for (const label of ["Variété", "Qualité alimentaire", "Sucre ajouté", "Exposition liquide / concentrée", "Ultra-transformation", "Couverture nutritionnelle", "Énergie"]) {
      expect(html).toContain(label);
    }
    for (const weight of ["15 %", "12 %", "13 %"]) expect(html).toContain(weight);
    expect(html).toMatch(/Contribution/);
    expect(html).toMatch(/12[,.]6/);
    expect(html).toContain("10 / 14 jours couverts");
    expect(html).toContain("12 / 28 jours observés");
    expect(html).toContain("sans barre");
    expect(html).toContain('role="img"');
    expect(html).toContain("Point positif");
    expect(html).toContain("Point négatif");
    expect(html).toMatch(/data-key="addedSugar"[^>]*data-state="insufficient"/);
    const missingDimension = html.slice(html.indexOf('data-key="addedSugar"'), html.indexOf('data-key="sugarExposure"'));
    expect(missingDimension).toContain("<b>—</b>");
    expect(missingDimension).not.toContain("<b>0</b>");
  });
});
