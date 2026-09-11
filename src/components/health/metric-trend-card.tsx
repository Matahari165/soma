import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { filterCalendarWindow, summarizeTrend, type MetricPoint, type TrendDirection } from "@/domain/metrics/trends";

import { LineTrendChart } from "./health-charts";
import { AnimatedMetricReading, type AnimatedValueFormat } from "./animated-value";
import { MetricReading } from "./metric-reading";

function defaultFormat(value: number) { return Math.round(value * 10) / 10 + ""; }
const shortDateFormat = new Intl.DateTimeFormat("fr-FR", { month: "short", day: "numeric" });

export function MetricTrendCard({ label, points, unit, direction, format = defaultFormat, target, href, displayDays = 30, animateCurrent = false, animationFormat = "decimal" }: {
  label: string;
  points: MetricPoint[];
  unit?: string;
  direction: TrendDirection;
  format?: (value: number) => string;
  target?: number | null;
  href?: string;
  displayDays?: 7 | 30 | 90;
  animateCurrent?: boolean;
  animationFormat?: AnimatedValueFormat;
}) {
  const trend = summarizeTrend(points, direction);
  const chartPoints = filterCalendarWindow(points, displayDays);
  const completeCount = chartPoints.filter((point) => point.value !== null).length;
  const current = trend.current;
  const comparison = trend.comparisons[0];
  const delta = comparison.percentDelta;
  const favorable = delta === null || direction === "context_only" ? "neutral" : (direction === "higher_is_better" ? delta > 0 : delta < 0) ? "positive" : "negative";
  const Icon = delta === null || Math.abs(delta) < 0.05 ? ArrowRight : delta > 0 ? ArrowUpRight : ArrowDownRight;
  const availablePoints = points.filter((point) => point.value !== null);
  const formatDate = (value: string | undefined) => value ? shortDateFormat.format(new Date(`${value}T12:00:00`)) : "";
  const firstDate = formatDate(chartPoints.at(0)?.date);
  const lastDate = formatDate(availablePoints.at(-1)?.date);
  if (completeCount < 2) {
    const pendingContent = <><span>{label}</span>{animateCurrent ? <AnimatedMetricReading value={current} unit={current === null ? undefined : unit} format={animationFormat} /> : <MetricReading value={current === null ? "—" : format(current)} unit={current === null ? undefined : unit} />}<p>D’autres mesures sont nécessaires</p></>;
    return href
      ? <Link className="metric-trend-card metric-trend-card--pending metric-trend-card--link" href={href} aria-label={`Ouvrir le détail de ${label}`}>{pendingContent}</Link>
      : <article className="metric-trend-card metric-trend-card--pending">{pendingContent}</article>;
  }
  const variability = trend.variability30d === null ? "indisponible" : format(trend.variability30d);
  const cardContent = <>
    <header><div><span>{label}</span>{animateCurrent ? <AnimatedMetricReading value={current} unit={current === null ? undefined : unit} format={animationFormat} /> : <MetricReading value={current === null ? "—" : format(current)} unit={current === null ? undefined : unit} />}</div><span className={`metric-direction metric-direction--${favorable}`}><Icon size={15} aria-hidden="true" />{delta === null ? "Référence en attente" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} % vs 7 j`}</span></header>
    <div className="chart-frame"><LineTrendChart points={chartPoints} label={label} target={target} /></div>
    <div className="chart-axis" aria-hidden="true"><span>{firstDate}</span><span>{lastDate}</span></div>
    <div className="baseline-row">{trend.comparisons.map((item) => <span key={item.days}><small>moy. {item.days} j · {item.sampleSize}/{item.days}</small><strong>{item.average === null ? "—" : format(item.average)}</strong></span>)}</div>
    <footer><span>Dernière mesure&nbsp;{formatDate(trend.currentDate ?? undefined)} · {completeCount} jours mesurés</span>{href && <ArrowUpRight className="metric-card-cue" size={17} aria-hidden="true" />}</footer>
  </>;
  const accessibleSummary = `${label}. Valeur actuelle : ${current === null ? "indisponible" : `${format(current)}${unit ? ` ${unit}` : ""}`}. Variabilité sur 30 jours : ${variability}. Évolution : ${trend.sustainedChange.replaceAll("_", " ")}.`;
  return href
    ? <Link className="metric-trend-card metric-trend-card--link" href={href} aria-label={`Ouvrir le détail. ${accessibleSummary}`}>{cardContent}</Link>
    : <article className="metric-trend-card" aria-label={accessibleSummary}>{cardContent}</article>;
}
