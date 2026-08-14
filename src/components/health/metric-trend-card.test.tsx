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
    expect(markup).toContain("30-day");
    expect(markup).not.toContain("30d variability:");
  });
});
