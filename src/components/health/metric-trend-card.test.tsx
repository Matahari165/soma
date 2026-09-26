import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MetricTrendCard } from "./metric-trend-card";
import { aggregateBarPoints, BarTrendChart, ChartHoverTooltip } from "./health-charts";

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

  it("uses vertical bars for compact activity charts while keeping coverage accessible", () => {
    const markup = renderToStaticMarkup(createElement(MetricTrendCard, {
      label: "Zone minutes",
      points: [
        { date: "2026-09-08", value: 0 },
        { date: "2026-09-09", value: null },
        { date: "2026-09-10", value: 24 },
      ],
      unit: "min",
      direction: "higher_is_better",
      compact: true,
      chartType: "bar",
      valueFormat: "number",
    }));

    expect(markup).toContain("health-bar-chart");
    expect(markup.match(/class="health-chart-bar/g)?.length).toBe(2);
    expect(markup).not.toContain("n=2");
    expect(markup).not.toContain("<footer");
    expect(markup).toContain("2 measured days");
    expect(markup).toContain("Coverage: 2/3 measured days");
  });

  it("labels the activity average beside the plot without highlighting the last bar", () => {
    const markup = renderToStaticMarkup(createElement(MetricTrendCard, {
      label: "Active calories",
      points: [
        { date: "2026-09-08", value: 400 },
        { date: "2026-09-09", value: 500 },
        { date: "2026-09-10", value: 600 },
      ],
      unit: "kcal",
      direction: "higher_is_better",
      compact: true,
      chartType: "bar",
      valueFormat: "number",
      averageInChart: true,
    }));

    expect(markup).toContain("health-chart-average-label");
    expect(markup).toContain("500 kcal");
    expect(markup).not.toContain("health-chart-bar--latest");
    expect(markup).not.toContain("metric-trend-card__average-legend");
  });

  it("keeps one measured bar visible on a fixed score scale and exposes every missing date slot", () => {
    const markup = renderToStaticMarkup(createElement(MetricTrendCard, {
      label: "Score history",
      points: [
        { date: "2026-09-08", value: 76 },
        { date: "2026-09-09", value: null },
        { date: "2026-09-10", value: null },
      ],
      unit: "/100",
      direction: "higher_is_better",
      compact: true,
      chartType: "bar",
      valueFormat: "number",
      averageInChart: true,
      domain: { min: 0, max: 100 },
    }));

    expect(markup).toContain("health-bar-chart");
    expect(markup.match(/class="health-chart-bar/g)?.length).toBe(1);
    expect(markup.match(/data-chart-hit-area=/g)?.length).toBe(3);
    expect(markup).toContain("Donnée absente");
    expect(markup).toContain("100 /100");
    expect(markup).toContain("0 /100");
    expect(markup).not.toContain("More measurements needed");
  });

  it("renders a localized date/value tooltip and announces keyboard or touch selections", () => {
    const markup = renderToStaticMarkup(createElement(ChartHoverTooltip, {
      date: "2026-09-09",
      value: "76 /100",
      xPercent: 12,
      align: "start",
      announce: true,
    }));

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('data-align="start"');
    expect(markup).toContain("Sep 9");
    expect(markup).toContain("76 /100");
  });

  it("keeps workout start times in the accessible chart description and tooltip labels", () => {
    const markup = renderToStaticMarkup(createElement(BarTrendChart, {
      label: "Distance",
      valueFormat: "pace",
      points: [
        { date: "2026-09-21", label: "2026-09-21 · 08:30 AM", value: 360 },
        { date: "2026-09-21", label: "2026-09-21 · 06:15 PM", value: 420 },
      ],
    }));

    expect(markup).toContain("2026-09-21 · 08:30 AM : 6:00 min/km");
    expect(markup).toContain("2026-09-21 · 06:15 PM : 7:00 min/km");
  });

  it("aggregates weekly bars without converting missing or zero values", () => {
    expect(aggregateBarPoints([
      { date: "2026-09-07", value: 10 },
      { date: "2026-09-08", value: 0 },
      { date: "2026-09-14", value: null },
      { date: "2026-09-15", value: 20 },
    ], "week")).toEqual([
      { date: "2026-09-07", value: 5 },
      { date: "2026-09-14", value: 20 },
    ]);
  });
});
