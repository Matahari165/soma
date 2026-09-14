import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HealthLoadingShell } from "./health-loading-shell";

describe("HealthLoadingShell", () => {
  it("réserve la structure secondaire sans rendre les anciens widgets de score", () => {
    const html = renderToStaticMarkup(createElement(HealthLoadingShell, { kind: "sleep", title: "Sommeil" }));

    expect(html).toContain('data-health-kind="sleep"');
    expect(html).toContain('aria-label="Chargement de la page Sommeil"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Chargement des données…");
    expect(html).toContain("Indicateurs récents");
    expect(html).toContain("Tendances");
    expect(html).toContain("Données complémentaires");
    expect(html).toContain("Qualité des données");
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("health-hero-metrics");
    expect(html).not.toContain("health-loading-card");
    expect(html).not.toContain("Score de sommeil");
    expect(html).not.toContain("<svg");
  });

  it("conserve quatre emplacements d’indicateurs et deux tendances partagés", () => {
    const html = renderToStaticMarkup(createElement(HealthLoadingShell, { kind: "activity", title: "Effort" }));

    expect(html.match(/data-testid="health-loading-signal-slot"/g)).toHaveLength(4);
    expect(html.match(/data-testid="health-loading-trend-slot"/g)).toHaveLength(2);
  });
});
