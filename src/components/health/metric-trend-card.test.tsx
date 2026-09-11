import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MetricTrendCard } from "./metric-trend-card";

describe("MetricTrendCard", () => {
  it("makes overview cards directly navigable without exposing secondary variability copy", () => {
    const markup = renderToStaticMarkup(createElement(MetricTrendCard, {
      label: "Sleep score",
      points: [
        { date: "2026-08-12", value: 71 },
        { date: "2026-08-13", value: 76 },
        { date: "2026-08-14", value: 79 },
      ],
      unit: "/100",
      direction: "higher_is_better",
      href: "/sleep",
    }));

    expect(markup).toContain('href="/sleep"');
    expect(markup).toContain("30 jours");
    expect(markup).not.toContain("30d variability:");
  });

  it("anchors both chart labels to the displayed calendar window", () => {
    const markup = renderToStaticMarkup(createElement(MetricTrendCard, {
      label: "Variabilité nocturne",
      points: [
        { date: "2026-09-08", value: 48 },
        { date: "2026-09-09", value: 52 },
        { date: "2026-09-10", value: null },
      ],
      unit: "ms",
      direction: "higher_is_better",
    }));

    expect(markup).toMatch(/class="chart-axis"[^>]*><span>8 sept\.<\/span><span>10 sept\.<\/span>/);
  });
});
