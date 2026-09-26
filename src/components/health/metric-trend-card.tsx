import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import { filterCalendarWindow, summarizeTrend, type MetricPoint, type TrendDirection } from "@/domain/metrics/trends";
import { aggregateBarPoints, type BarAggregation } from "@/domain/metrics/bar-aggregation";

import { BarTrendChart, LineTrendChart, type ChartValueFormat } from "./health-charts";
import { AnimatedMetricReading, type AnimatedValueFormat } from "./animated-value";
import { MetricReading } from "./metric-reading";

function defaultFormat(value: number) { return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value); }
const shortDateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
function formatCompactAverage(value: number, format: (value: number) => string, unit?: string) {
  const formatted = format(value);
  return `${formatted}${unit === "%" || unit?.startsWith("/") ? unit : unit ? ` ${unit}` : ""}`;
}

type InlineMetricReference = {
  value: number | null;
  label: string;
  sampleSize: number;
  deltaLabel?: string;
  tone?: "positive" | "negative" | "neutral";
};

function inlineReferenceText(reference: InlineMetricReference, format: (value: number) => string, unit?: string) {
  const average = reference.value === null ? "—" : formatCompactAverage(reference.value, format, unit);
  const sample = reference.sampleSize > 0 ? ` · n = ${reference.sampleSize}` : "";
  const delta = reference.deltaLabel ? ` · ${reference.deltaLabel}` : "";
  return `${reference.label} · ${average}${sample}${delta}`;
}

function inlineReferenceMarkup(reference: InlineMetricReference, format: (value: number) => string, unit?: string) {
  return <><span>{`${reference.label} · ${reference.value === null ? "—" : formatCompactAverage(reference.value, format, unit)}${reference.sampleSize > 0 ? ` · n = ${reference.sampleSize}` : ""}`}</span>{reference.deltaLabel && <span className="metric-trend-card__reference-delta" data-tone={reference.tone ?? "neutral"}> · {reference.deltaLabel}</span>}</>;
}

export function MetricTrendCard({ label, points, unit, direction, format = defaultFormat, target, href, displayDays = 30, animateCurrent = false, animationFormat = "decimal", compact = false, valueFormat, chartType = "line", barAggregation = "day", averageInChart = false, inlineReference, highlightLatest, domain }: {
  label: string;
  points: MetricPoint[];
  unit?: string;
  direction: TrendDirection;
  format?: (value: number) => string;
  target?: number | null;
  href?: string;
  displayDays?: number;
  animateCurrent?: boolean;
  animationFormat?: AnimatedValueFormat;
  /** Sleep's trend rail keeps only the current value, its 30-day average and the chart. */
  compact?: boolean;
  /** Serializable chart formatter used across the Server/Client boundary. */
  valueFormat?: ChartValueFormat;
  /** Compact metric views use bars when the measured series supports comparisons by period. */
  chartType?: "line" | "bar";
  barAggregation?: BarAggregation;
  /** Place the measured average on the plot and in its right-hand scale. */
  averageInChart?: boolean;
  /** Optional 30-day comparison shown beside the current value and on the chart. */
  inlineReference?: InlineMetricReference;
  /** Keep the latest session highlighted when a separate reference line is shown. */
  highlightLatest?: boolean;
  /** Optional fixed bounds, extended only to avoid cutting off an out-of-range measurement. */
  domain?: { min: number; max: number };
}) {
  const trend = summarizeTrend(points, direction);
  const chartPoints = filterCalendarWindow(points, displayDays);
  const completeCount = chartPoints.filter((point) => point.value !== null).length;
  const current = trend.current;
  const comparison = trend.comparisons[0];
  const delta = comparison.percentDelta;
  const favorable = delta === null || direction === "context_only" ? "neutral" : (direction === "higher_is_better" ? delta > 0 : delta < 0) ? "positive" : "negative";
  const Icon = delta === null || Math.abs(delta) < 0.05 ? ArrowRight : delta > 0 ? ArrowUpRight : ArrowDownRight;
  const formatDate = (value: string | undefined) => value ? shortDateFormat.format(new Date(`${value}T12:00:00`)) : "";
  const axisPoints = chartType === "bar" ? aggregateBarPoints(chartPoints, barAggregation) : chartPoints;
  const firstDate = formatDate(axisPoints.at(0)?.date);
  const lastDate = formatDate(axisPoints.at(-1)?.date);
  const compactAverageValues = chartPoints.map((point) => point.value).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const compactAverage = compactAverageValues.length ? compactAverageValues.reduce((sum, value) => sum + value, 0) / compactAverageValues.length : null;
  const currentContent = animateCurrent
    ? <AnimatedMetricReading value={current} unit={current === null ? undefined : unit} format={animationFormat} />
    : <MetricReading value={current === null ? "—" : format(current)} unit={current === null ? undefined : unit} />;
  if (completeCount < (chartType === "bar" ? 1 : 2)) {
    const pendingContent = <><header><div><span>{label}</span>{(!averageInChart || inlineReference) && (inlineReference ? <span className="metric-trend-card__current" data-tone={inlineReference.tone ?? "neutral"}>{currentContent}</span> : currentContent)}</div>{compact && (!averageInChart || inlineReference) && <small className="metric-trend-card__average">{inlineReference ? inlineReferenceMarkup(inlineReference, format, unit) : "avg —"}</small>}</header><p>More measurements needed</p></>;
    return href
      ? <Link className="metric-trend-card metric-trend-card--pending metric-trend-card--link" href={href} aria-label={`Open details for ${label}`}>{pendingContent}</Link>
      : <article className="metric-trend-card metric-trend-card--pending">{pendingContent}</article>;
  }
  if (compact) {
    const measuredIndexes = axisPoints.flatMap((point, index) => typeof point.value === "number" && Number.isFinite(point.value) ? [index] : []);
    // The bars occupy the SVG's 8–292 plot. Center the heading between the
    // first and last drawn bars, even when the calendar has empty end slots.
    const plotMidpoint = chartType === "bar" && measuredIndexes.length && axisPoints.length
      ? (8 + ((measuredIndexes[0] + measuredIndexes.at(-1)! + 1) / 2) * (284 / axisPoints.length)) / 300
      : 0.5;
    const titlePosition: CSSProperties = { position: "relative", left: `calc(${(plotMidpoint * 100).toFixed(4)}% - 50%)` };
    const coverage = chartPoints.length ? Math.round((completeCount / chartPoints.length) * 100) : 0;
    const displayedValues = axisPoints.map((point) => point.value).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const displayedAverage = displayedValues.length ? displayedValues.reduce((sum, value) => sum + value, 0) / displayedValues.length : null;
    const referenceAverage = inlineReference ? inlineReference.value : displayedAverage;
    const accessibleSummary = averageInChart
      ? inlineReference
        ? `${label}. ${inlineReferenceText(inlineReference, format, unit)}. ${displayedValues.length} measured points.`
        : `${label}. Chart average: ${referenceAverage === null ? "unavailable" : formatCompactAverage(referenceAverage, format, unit)}. ${displayedValues.length} ${barAggregation === "week" ? "measured weeks" : "measured days"}.`
      : `${label}. Current value: ${current === null ? "unavailable" : `${format(current)}${unit ? ` ${unit}` : ""}`}. ${displayDays}-day average: ${compactAverage === null ? "unavailable" : `${format(compactAverage)}${unit ? ` ${unit}` : ""}`} (${compactAverageValues.length} measured days). Coverage: ${completeCount}/${chartPoints.length} measured days · ${coverage}%.`;
    const chart = chartType === "bar"
      ? <BarTrendChart points={chartPoints} label={label} target={target} unit={unit} valueFormat={valueFormat} aggregation={barAggregation} average={averageInChart ? referenceAverage : null} highlightLatest={highlightLatest ?? !averageInChart} domain={domain} />
      : <LineTrendChart points={chartPoints} label={label} target={target} unit={unit} valueFormat={valueFormat} />;
    const compactContent = <>
      <header><div><span style={titlePosition}>{label}</span>{(!averageInChart || inlineReference) && (inlineReference ? <span className="metric-trend-card__current" data-tone={inlineReference.tone ?? "neutral"}>{currentContent}</span> : currentContent)}</div>{(!averageInChart || inlineReference) && <small className="metric-trend-card__average">{inlineReference ? inlineReferenceMarkup(inlineReference, format, unit) : compactAverage === null ? "avg —" : `avg ${formatCompactAverage(compactAverage, format, unit)}`}</small>}</header>
      <div className="chart-frame">{chart}</div>
      <div className="chart-axis" aria-hidden="true"><span>{firstDate}</span><span>{lastDate}</span></div>
    </>;
    return href
      ? <Link className="metric-trend-card metric-trend-card--link" href={href} aria-label={`Open details. ${accessibleSummary}`}>{compactContent}</Link>
      : <article className="metric-trend-card" aria-label={accessibleSummary}>{compactContent}</article>;
  }
  const variability = trend.variability30d === null ? "unavailable" : format(trend.variability30d);
  const cardChart = chartType === "bar"
    ? <BarTrendChart points={chartPoints} label={label} target={target} unit={unit} valueFormat={valueFormat} aggregation={barAggregation} domain={domain} />
    : <LineTrendChart points={chartPoints} label={label} target={target} unit={unit} valueFormat={valueFormat} />;
  const cardContent = <>
    <header><div><span>{label}</span>{animateCurrent ? <AnimatedMetricReading value={current} unit={current === null ? undefined : unit} format={animationFormat} /> : <MetricReading value={current === null ? "—" : format(current)} unit={current === null ? undefined : unit} />}</div><span className={`metric-direction metric-direction--${favorable}`}><Icon size={15} aria-hidden="true" />{delta === null ? "Baseline pending" : `${delta > 0 ? "+" : ""}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(Math.abs(delta))}% vs 7d`}</span></header>
    <div className="chart-frame">{cardChart}</div>
    <div className="chart-axis" aria-hidden="true"><span>{firstDate}</span><span>{lastDate}</span></div>
    <div className="baseline-row">{trend.comparisons.map((item) => <span key={item.days}><small>avg {item.days}d · {item.sampleSize}/{item.days}</small><strong>{item.average === null ? "—" : format(item.average)}</strong></span>)}</div>
    <footer><span>Last measured&nbsp;{formatDate(trend.currentDate ?? undefined)} · {completeCount} measured days</span>{href && <ArrowUpRight className="metric-card-cue" size={17} aria-hidden="true" />}</footer>
  </>;
  const changeLabel = trend.sustainedChange === "improving" ? "improving" : trend.sustainedChange === "declining" ? "declining" : "stable";
  const accessibleSummary = `${label}. Current value: ${current === null ? "unavailable" : `${format(current)}${unit ? ` ${unit}` : ""}`}. 30-day variability: ${variability}. Trend: ${changeLabel}.`;
  return href
    ? <Link className="metric-trend-card metric-trend-card--link" href={href} aria-label={`Open details. ${accessibleSummary}`}>{cardContent}</Link>
    : <article className="metric-trend-card" aria-label={accessibleSummary}>{cardContent}</article>;
}
