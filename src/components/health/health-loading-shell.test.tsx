import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HealthLoadingShell } from "./health-loading-shell";

describe("HealthLoadingShell", () => {
  it("réserve la structure secondaire sans rendre les anciens widgets de score", () => {
    const html = renderToStaticMarkup(createElement(HealthLoadingShell, { kind: "sleep", title: "Sleep" }));

    expect(html).toContain('data-health-kind="sleep"');
    expect(html).toContain('aria-label="Loading Sleep"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading data…");
    expect(html).toContain("Recent indicators");
    expect(html).toContain("Trends");
    expect(html).toContain("Supporting data");
    expect(html).toContain("Data quality");
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("health-hero-metrics");
    expect(html).not.toContain("health-loading-card");
    expect(html).not.toContain("Sleep score");
    expect(html).not.toContain("<svg");
  });

  it("conserve quatre emplacements d’indicateurs et deux tendances partagés", () => {
    const html = renderToStaticMarkup(createElement(HealthLoadingShell, { kind: "activity", title: "Strain" }));

    expect(html.match(/data-testid="health-loading-signal-slot"/g)).toHaveLength(4);
    expect(html.match(/data-testid="health-loading-trend-slot"/g)).toHaveLength(2);
  });
});
