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

    expect(markup).toMatch(/class="chart-axis"[^>]*><span>Sep 8<\/span><span>Sep 10<\/span>/);
  });

  it("passes custom duration formatting to the chart's accessible labels", () => {
    const markup = renderToStaticMarkup(createElement(MetricTrendCard, {
      label: "Durée",
      points: [
        { date: "2026-09-09", value: 450 },
        { date: "2026-09-10", value: 468 },
      ],
      direction: "higher_is_better",
      format: (value: number) => `${Math.floor(Math.round(value) / 60)}h ${Math.round(value) % 60}m`,
      valueFormat: "duration",
      compact: true,
    }));

    expect(markup).toContain("Moyenne 7h 39m");
    expect(markup).toContain("avg 7h 39m");
    expect(markup).toContain("2026-09-10 : 7h 48m");
    expect(markup).not.toContain("468.0");
  });

  it("formats clock values around midnight without exposing the normalized minutes", () => {
    const markup = renderToStaticMarkup(createElement(MetricTrendCard, {
      label: "Heure du coucher",
      points: [
        { date: "2026-09-09", value: 1438 },
        { date: "2026-09-10", value: 1450 },
      ],
      direction: "context_only",
      format: (value: number) => {
        const normalized = ((value % 1440) + 1440) % 1440;
        return `${Math.floor(normalized / 60)}:${String(Math.round(normalized % 60)).padStart(2, "0")}`;
      },
      valueFormat: "clock",
      compact: true,
    }));

    expect(markup).toContain("Moyenne 0:04");
    expect(markup).toContain("avg 0:04");
    expect(markup).toContain("2026-09-10 : 0:10");
    expect(markup).not.toContain("1450.0");
  });

  it("keeps compact averages tight for percentage and rate units", () => {
    const percentageMarkup = renderToStaticMarkup(createElement(MetricTrendCard, {
      label: "Efficacité",
      points: [
        { date: "2026-09-09", value: 90 },
        { date: "2026-09-10", value: 92.2 },
      ],
      unit: "%",
      direction: "higher_is_better",
      compact: true,
    }));
    const rateMarkup = renderToStaticMarkup(createElement(MetricTrendCard, {
      label: "Fragmentation",
      points: [
        { date: "2026-09-09", value: 1 },
        { date: "2026-09-10", value: 1.2 },
      ],
      unit: "/h",
      direction: "lower_is_better",
      compact: true,
    }));

    expect(percentageMarkup).toContain("avg 91.1%");
    expect(percentageMarkup).not.toContain("avg 91.1 %");
    expect(rateMarkup).toContain("avg 1.1/h");
  });
});
