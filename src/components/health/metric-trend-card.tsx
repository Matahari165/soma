import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

import { summarizeTrend, type MetricPoint, type TrendDirection } from "@/domain/metrics/trends";

import { LineTrendChart } from "./health-charts";

function defaultFormat(value: number) { return Math.round(value * 10) / 10 + ""; }

export function MetricTrendCard({ label, points, unit, direction, description, format = defaultFormat, target }: {
  label: string;
  points: MetricPoint[];
  unit?: string;
  direction: TrendDirection;
  description: string;
  format?: (value: number) => string;
  target?: number | null;
}) {
  const trend = summarizeTrend(points, direction);
  const completeCount = points.filter((point) => point.value !== null).length;
  const current = trend.current;
  const comparison = trend.comparisons[0];
  const delta = comparison.percentDelta;
  const favorable = delta === null || direction === "context_only" ? "neutral" : (direction === "higher_is_better" ? delta > 0 : delta < 0) ? "positive" : "negative";
  const Icon = delta === null || Math.abs(delta) < 0.05 ? ArrowRight : delta > 0 ? ArrowUpRight : ArrowDownRight;
  if (completeCount < 2) return <article className="metric-trend-card metric-trend-card--pending"><span>{label}</span><strong>{current === null ? "—" : format(current)}{current === null || !unit ? "" : ` ${unit}`}</strong><p>More readings needed</p></article>;
  return <article className="metric-trend-card">
    <header><div><span>{label}</span><strong>{current === null ? "—" : format(current)}{current === null || !unit ? "" : ` ${unit}`}</strong></div><span className={`metric-direction metric-direction--${favorable}`}><Icon size={15} aria-hidden="true" />{delta === null ? "Baseline pending" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}% vs 7d`}</span></header>
    <LineTrendChart values={points.slice(-30).map((point) => point.value)} label={label} target={target} />
    <div className="baseline-row">{trend.comparisons.map((item) => <span key={item.days}><small>{item.days}d avg</small><strong>{item.average === null ? "—" : format(item.average)}</strong></span>)}</div>
    <p className="metric-trend-card__note">{description}</p>
    <footer><span>30d variability: {trend.variability30d === null ? "—" : format(trend.variability30d)}</span><span>{trend.sustainedChange.replaceAll("_", " ")}</span></footer>
  </article>;
}
