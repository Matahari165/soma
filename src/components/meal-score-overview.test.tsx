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

    expect(html).toContain('aria-label="Équilibre alimentaire"');
    expect(html).not.toContain(">Équilibre alimentaire</h2>");
    expect(html).toContain("Score indisponible");
    expect(html).toContain("Couverture");
    expect(html).toContain("Confiance");
    expect(html).toContain("Aucun historique de score disponible.");
    expect(html).toContain("Aucune moyenne disponible.");
    expect(html).toContain("Historique du score");
    expect(html).not.toContain("Détail des 7 dimensions");
    expect(html).not.toContain(">0 %</dd>");
  });

  it("rend le radar interactif et garde les axes accessibles sans confondre null et zéro", () => {
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
    expect(html).toContain("Contribution");
    expect(html).toContain("8 / 14 jours observés");
    expect(html).toContain("12 / 28 jours observés");
    expect(html).toContain("sans barre");
    expect(html.match(/role="img"/g)).toHaveLength(1);
    expect(html.match(/role="button"/g)).toHaveLength(7);
    expect(html.match(/aria-controls="meal-score-dimension-detail"/g)).toHaveLength(7);
    expect(html).toContain('data-key="variety"');
    expect(html).toContain('aria-label="Sucre ajouté. Score indisponible. Afficher les détails de cette dimension."');
    expect(html).toContain("Profil des sept dimensions de l’équilibre alimentaire");
    expect(html).not.toContain("NaN");
    expect(html).toContain("Point positif");
    expect(html).toContain("Point négatif");
    expect(html).not.toContain("Détail des 7 dimensions");
  });
});
