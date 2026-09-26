"use client";

import { useMotionUpdate } from "@/components/motion/use-motion-update";

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import type { HeartRateSample, SleepStageSegment } from "@/services/health-analytics";
import type { MetricPoint } from "@/domain/metrics/trends";
import { aggregateBarPoints, type BarAggregation } from "@/domain/metrics/bar-aggregation";

import styles from "./health-charts.module.css";

export type ChartValueFormat = "number" | "decimal" | "duration" | "clock" | "pace";
export { aggregateBarPoints } from "@/domain/metrics/bar-aggregation";
export type { BarAggregation } from "@/domain/metrics/bar-aggregation";

const CHART_VIEWBOX_WIDTH = 300;
const CHART_VIEWBOX_HEIGHT = 174;
const CHART_PLOT_TOP = 27;
const CHART_PLOT_BOTTOM = 154;
const CHART_PLOT_HEIGHT = CHART_PLOT_BOTTOM - CHART_PLOT_TOP;

function formatChartValue(value: number | null, unit?: string, valueFormat: ChartValueFormat = "decimal") {
  if (value === null || !Number.isFinite(value)) return "Donnée absente";
  const formatted = valueFormat === "number"
    ? Math.round(value).toLocaleString("fr-FR")
    : valueFormat === "duration"
      ? `${Math.floor(Math.abs(Math.round(value)) / 60)}h ${Math.abs(Math.round(value)) % 60}m`
      : valueFormat === "pace"
        ? `${Math.floor(Math.abs(Math.round(value)) / 60)}:${String(Math.abs(Math.round(value)) % 60).padStart(2, "0")}`
      : valueFormat === "clock"
        ? (() => {
            const normalized = ((Math.round(value) % 1440) + 1440) % 1440;
            return `${Math.floor(normalized / 60)}:${String(normalized % 60).padStart(2, "0")}`;
          })()
        : value.toFixed(1);
  return valueFormat === "pace" ? `${formatted} min/km` : `${formatted}${unit ? ` ${unit}` : ""}`;
}

function chartDescription(label: string, points: MetricPoint[], unit?: string, valueFormat?: ChartValueFormat) {
  return `${label}. ${points.map((point) => `${point.label ?? point.date} : ${formatChartValue(point.value, unit, valueFormat)}`).join(" ; ")}`;
}

type ChartTooltipAlignment = "start" | "center" | "end";
type ChartSelection = { index: number; pinned: boolean; source: "pointer" | "keyboard" | "touch" };

function formatChartDate(date: string) {
  const separator = date.indexOf(" · ");
  const civilDate = separator >= 0 ? date.slice(0, separator) : date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(civilDate)) return date;
  const parsedDate = new Date(`${civilDate}T12:00:00`);
  if (!Number.isFinite(parsedDate.getTime())) return date;
  const formatted = new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric", month: "short" }).format(parsedDate);
  return separator >= 0 ? `${formatted} · ${date.slice(separator + 3)}` : formatted;
}

/** Shared compact date/value label for chart interactions. Its parent should match the plot width and be positioned. */
export function ChartHoverTooltip({ date, value, xPercent, align = "center", announce = false }: {
  date: string;
  value: string;
  xPercent: number;
  align?: ChartTooltipAlignment;
  announce?: boolean;
}) {
  const safeXPercent = Number.isFinite(xPercent) ? Math.min(100, Math.max(0, xPercent)) : 50;
  return <output className={styles.chartTooltip} data-align={align} role={announce ? "status" : "tooltip"} aria-live={announce ? "polite" : "off"} aria-atomic="true" style={{ left: `${safeXPercent}%` }}>
    {formatChartDate(date)} · {value}
  </output>;
}

function tooltipAlignment(xPercent: number): ChartTooltipAlignment {
  return xPercent < 18 ? "start" : xPercent > 82 ? "end" : "center";
}

function useChartSelection(pointCount: number, defaultIndex: number) {
  const [selection, setSelection] = useState<ChartSelection | null>(null);
  const onFocus = () => setSelection((current) => current ?? { index: defaultIndex, pinned: false, source: "keyboard" });
  const onBlur = () => setSelection((current) => current?.pinned ? current : null);
  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === "Escape") {
      setSelection(null);
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    setSelection((current) => {
      const index = current?.index ?? defaultIndex;
      const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? pointCount - 1 : Math.min(pointCount - 1, Math.max(0, index + (event.key === "ArrowLeft" ? -1 : 1)));
      return { index: nextIndex, pinned: false, source: "keyboard" };
    });
  };
  const onPointerEnter = (index: number) => setSelection({ index, pinned: false, source: "pointer" });
  const onPointerLeave = (event: PointerEvent<SVGRectElement>) => setSelection((current) => event.pointerType === "touch" && current?.pinned ? current : null);
  const onTouchEnd = (index: number) => setSelection({ index, pinned: true, source: "touch" });
  const onClick = (index: number) => setSelection((current) => ({
    index,
    pinned: true,
    source: current?.index === index && current.source === "touch" ? "touch" : current?.index === index && current.source === "keyboard" ? "keyboard" : "pointer",
  }));
  return { selection, onFocus, onBlur, onKeyDown, onPointerEnter, onPointerLeave, onTouchEnd, onClick };
}

function formatDurationMs(value: number | null) {
  if (value === null || !Number.isFinite(value) || value <= 0) return "durée indisponible";
  const minutes = Math.max(1, Math.round(value / 60_000));
  return `${minutes} min`;
}

export function BarTrendChart({ points, label, target, unit, valueFormat = "decimal", aggregation = "day", average = null, highlightLatest = true, domain, animateUpdates = true }: { points: MetricPoint[]; label: string; target?: number | null; unit?: string; valueFormat?: ChartValueFormat; aggregation?: BarAggregation; average?: number | null; highlightLatest?: boolean; domain?: { min: number; max: number }; animateUpdates?: boolean }) {
  const titleId = useId();
  const descriptionId = useId();
  const chartPoints = aggregateBarPoints(points, aggregation);
  const chartRef = useRef<HTMLDivElement>(null);
  useMotionUpdate(chartRef, animateUpdates ? `${aggregation}:${chartPoints.map((point) => `${point.date}:${point.value}`).join("|")}:${target}:${average}` : null);
  const available = chartPoints.filter((point): point is MetricPoint & { value: number } => typeof point.value === "number" && Number.isFinite(point.value));
  const latestMeasuredIndex = chartPoints.reduce((latest, point, index) => typeof point.value === "number" && Number.isFinite(point.value) ? index : latest, 0);
  const selectionState = useChartSelection(chartPoints.length, latestMeasuredIndex);
  const { selection } = selectionState;
  const description = chartDescription(label, chartPoints, unit, valueFormat);
  if (available.length === 0) return <div ref={chartRef} className="health-line-chart-wrap"><p className="health-empty">Pas assez de mesures complètes pour afficher une tendance.</p><p id={descriptionId} className="sr-only">{description}</p></div>;
  const measuredTarget = typeof target === "number" && Number.isFinite(target) ? target : null;
  const rawMin = Math.min(...available.map((point) => point.value), measuredTarget ?? 0, 0);
  const measuredAverage = typeof average === "number" && Number.isFinite(average) ? average : null;
  const rawMax = Math.max(...available.map((point) => point.value), measuredTarget ?? 0, measuredAverage ?? 0, 1);
  const domainMin = domain && Number.isFinite(domain.min) ? domain.min : null;
  const domainMax = domain && domainMin !== null && Number.isFinite(domain.max) && domain.max > domainMin ? domain.max : null;
  const min = domainMin === null ? rawMin : Math.min(domainMin, rawMin);
  const max = domainMax === null ? min + Math.max(rawMax - rawMin, Math.abs(rawMax) * 0.1, 1) : Math.max(domainMax, rawMax);
  const range = Math.max(max - min, 1);
  const y = (value: number) => CHART_PLOT_BOTTOM - ((value - min) / range) * CHART_PLOT_HEIGHT;
  const baseline = y(0);
  const slotWidth = 284 / Math.max(chartPoints.length, 1);
  const barWidth = Math.max(3, Math.min(20, slotWidth * 0.64));
  const x = (index: number) => 8 + index * slotWidth + (slotWidth - barWidth) / 2;
  const activePoint = selection ? chartPoints[selection.index] : null;
  const tooltipXPercent = selection ? ((8 + (selection.index + .5) * slotWidth) / CHART_VIEWBOX_WIDTH) * 100 : 50;
  return <div ref={chartRef} className="health-line-chart-wrap"><div className={styles.chartPlot}><svg className={`${styles.barChart} health-bar-chart`} viewBox={`0 0 ${CHART_VIEWBOX_WIDTH} ${CHART_VIEWBOX_HEIGHT}`} preserveAspectRatio="none" role="img" tabIndex={0} aria-labelledby={titleId} aria-describedby={descriptionId} onFocus={selectionState.onFocus} onBlur={selectionState.onBlur} onKeyDown={selectionState.onKeyDown}>
    <line x1="8" y1={baseline} x2="292" y2={baseline} className="health-chart-grid" />
    {measuredTarget !== null && <line x1="8" y1={y(measuredTarget)} x2="292" y2={y(measuredTarget)} className="health-chart-target"><title>{`Objectif ${formatChartValue(measuredTarget, unit, valueFormat)}`}</title></line>}
    {chartPoints.map((point, index) => {
      if (point.value === null || !Number.isFinite(point.value)) return null;
      const top = y(Math.max(point.value, 0));
      const bottom = y(Math.min(point.value, 0));
      const height = Math.max(1, Math.abs(bottom - top));
      const isLatest = point.date === available.at(-1)?.date && point.value === available.at(-1)?.value;
      const className = ["health-chart-bar", isLatest && highlightLatest ? "health-chart-bar--latest" : "", selection?.index === index ? "health-chart-bar--active" : ""].filter(Boolean).join(" ");
      return <rect key={`${point.date}-${index}`} x={x(index)} y={Math.min(top, bottom)} width={barWidth} height={height} rx="1" className={className}><title>{`${point.label ?? point.date}: ${formatChartValue(point.value, unit, valueFormat)}`}</title></rect>;
    })}
    {measuredAverage !== null && <line x1="8" y1={y(measuredAverage)} x2="292" y2={y(measuredAverage)} className="health-chart-average"><title>{`Moyenne des périodes mesurées : ${formatChartValue(measuredAverage, unit, valueFormat)}`}</title></line>}
    {chartPoints.map((point, index) => <rect key={`slot-${point.date}-${index}`} className={styles.hitArea} data-chart-hit-area="" x={8 + index * slotWidth} y={CHART_PLOT_TOP} width={slotWidth} height={CHART_PLOT_HEIGHT} aria-hidden="true" onPointerEnter={() => selectionState.onPointerEnter(index)} onPointerLeave={selectionState.onPointerLeave} onPointerUp={(event) => { if (event.pointerType === "touch") selectionState.onTouchEnd(index); }} onClick={() => selectionState.onClick(index)} />)}
  </svg>{activePoint && <ChartHoverTooltip date={activePoint.label ?? activePoint.date} value={formatChartValue(activePoint.value, unit, valueFormat)} xPercent={tooltipXPercent} align={tooltipAlignment(tooltipXPercent)} announce={selection?.source !== "pointer"} />}</div><span id={titleId} className="sr-only">{label} : tendance en barres sur {available.length} périodes mesurées</span><p id={descriptionId} className="sr-only">{description}. Les absences ne sont pas dessinées comme zéro. Utilisez les flèches gauche et droite, Home et End pour parcourir toutes les périodes, y compris celles sans mesure.</p><span className="health-chart-range" aria-hidden="true"><b>{formatChartValue(max, unit, valueFormat)}</b><b>{formatChartValue(min, unit, valueFormat)}</b></span>{measuredAverage !== null && <span className="health-chart-average-label" aria-hidden="true" style={{ top: `${(y(measuredAverage) / CHART_VIEWBOX_HEIGHT) * 100}%` }}>{formatChartValue(measuredAverage, unit, valueFormat)}</span>}</div>;
}

export function LineTrendChart({ points, label, target, unit, valueFormat = "decimal" }: { points: MetricPoint[]; label: string; target?: number | null; unit?: string; valueFormat?: ChartValueFormat }) {
  const titleId = useId();
  const descriptionId = useId();
  const chartRef = useRef<HTMLDivElement>(null);
  useMotionUpdate(chartRef, `${points.map((point) => `${point.date}:${point.value}`).join("|")}:${target}`);
  const dated = points.map((point, index) => ({ ...point, index, timestamp: Date.parse(point.date) }));
  const selectable = dated.filter((point) => Number.isFinite(point.timestamp));
  const available = dated.filter((point): point is typeof point & { value: number } => typeof point.value === "number" && Number.isFinite(point.value) && Number.isFinite(point.timestamp));
  const latestMeasuredIndex = dated.reduce((latest, point) => typeof point.value === "number" && Number.isFinite(point.value) && Number.isFinite(point.timestamp) ? point.index : latest, 0);
  const selectionState = useChartSelection(dated.length, latestMeasuredIndex);
  const { selection } = selectionState;
  const description = chartDescription(label, points, unit, valueFormat);
  if (available.length < 2) return <div ref={chartRef} className="health-line-chart-wrap"><p className="health-empty">Pas assez de mesures complètes pour afficher une tendance.</p><p id={descriptionId} className="sr-only">{description}</p></div>;
  const measuredTarget = typeof target === "number" && Number.isFinite(target) ? target : null;
  const rawMin = Math.min(...available.map((point) => point.value), measuredTarget ?? Infinity);
  const rawMax = Math.max(...available.map((point) => point.value), measuredTarget ?? -Infinity);
  const average = available.reduce((sum, point) => sum + point.value, 0) / available.length;
  const range = Math.max(rawMax - rawMin, Math.abs(average) * 0.1, 1);
  const midpoint = (rawMin + rawMax) / 2;
  const min = midpoint - range / 2;
  const max = midpoint + range / 2;
  const firstTime = Math.min(...selectable.map((point) => point.timestamp));
  const lastTime = Math.max(...selectable.map((point) => point.timestamp));
  const x = (timestamp: number) => 8 + ((timestamp - firstTime) / Math.max(lastTime - firstTime, 1)) * 284;
  const y = (value: number) => CHART_PLOT_BOTTOM - ((value - min) / range) * CHART_PLOT_HEIGHT;
  const segments: Array<typeof available> = [];
  let current: typeof available = [];
  for (const point of dated) {
    if (typeof point.value !== "number" || !Number.isFinite(point.value) || !Number.isFinite(point.timestamp)) {
      if (current.length) segments.push(current);
      current = [];
      continue;
    }
    const previous = current.at(-1);
    if (previous && point.timestamp - previous.timestamp > 36 * 60 * 60 * 1000) {
      segments.push(current);
      current = [];
    }
    current.push(point as typeof available[number]);
  }
  if (current.length) segments.push(current);
  const activePoint = selection ? dated[selection.index] : null;
  const tooltipXPercent = activePoint && Number.isFinite(activePoint.timestamp) ? (x(activePoint.timestamp) / CHART_VIEWBOX_WIDTH) * 100 : 50;
  return <div ref={chartRef} className="health-line-chart-wrap"><div className={styles.chartPlot}><svg className={`${styles.lineChart} health-line-chart`} viewBox={`0 0 ${CHART_VIEWBOX_WIDTH} ${CHART_VIEWBOX_HEIGHT}`} preserveAspectRatio="none" role="img" tabIndex={0} aria-labelledby={titleId} aria-describedby={descriptionId} onFocus={selectionState.onFocus} onBlur={selectionState.onBlur} onKeyDown={selectionState.onKeyDown}>
    <line x1="8" y1={CHART_PLOT_BOTTOM} x2="292" y2={CHART_PLOT_BOTTOM} className="health-chart-grid" />
    <line x1="8" y1={y(average)} x2="292" y2={y(average)} className="health-chart-average"><title>{`Moyenne ${formatChartValue(average, unit, valueFormat)}`}</title></line>
    {measuredTarget !== null && <line x1="8" y1={y(measuredTarget)} x2="292" y2={y(measuredTarget)} className="health-chart-target"><title>{`Objectif ${formatChartValue(measuredTarget, unit, valueFormat)}`}</title></line>}
    {segments.map((segment, index) => {
      const line = segment.map((point) => `${x(point.timestamp)},${y(point.value)}`).join(" ");
      const area = `${x(segment[0].timestamp)},${CHART_PLOT_BOTTOM} ${line} ${x(segment.at(-1)?.timestamp ?? segment[0].timestamp)},${CHART_PLOT_BOTTOM}`;
      return <g key={`${segment[0].date}-${index}`}><polygon points={area} className="health-chart-area" data-chart-area="" /><polyline points={line} pathLength="1" className="health-chart-line" data-chart-trace="" /></g>;
    })}
    {available.map((point, index) => <circle key={`${point.date}-${point.value}-${index}`} cx={x(point.timestamp)} cy={y(point.value)} r={selection?.index === point.index || index === available.length - 1 ? 3.8 : 1.8} className={`${index === available.length - 1 ? "health-chart-point health-chart-point--latest" : "health-chart-point"}${selection?.index === point.index ? " health-chart-point--active" : ""}`}><title>{`${point.label ?? point.date}: ${formatChartValue(point.value, unit, valueFormat)}`}</title></circle>)}
    {selectable.map((point, index) => {
      const previous = selectable[index - 1];
      const next = selectable[index + 1];
      const left = previous ? Math.max(8, (x(previous.timestamp) + x(point.timestamp)) / 2) : 8;
      const right = next ? Math.min(292, (x(point.timestamp) + x(next.timestamp)) / 2) : 292;
      return <rect key={`slot-${point.date}-${point.index}`} className={styles.hitArea} data-chart-hit-area="" x={left} y={CHART_PLOT_TOP} width={Math.max(1, right - left)} height={CHART_PLOT_HEIGHT} aria-hidden="true" onPointerEnter={() => selectionState.onPointerEnter(point.index)} onPointerLeave={selectionState.onPointerLeave} onPointerUp={(event) => { if (event.pointerType === "touch") selectionState.onTouchEnd(point.index); }} onClick={() => selectionState.onClick(point.index)} />;
    })}
  </svg>{activePoint && <ChartHoverTooltip date={activePoint.label ?? activePoint.date} value={formatChartValue(activePoint.value, unit, valueFormat)} xPercent={tooltipXPercent} align={tooltipAlignment(tooltipXPercent)} announce={selection?.source !== "pointer"} />}</div><span id={titleId} className="sr-only">{label} : tendance sur {available.length} jours mesurés</span><p id={descriptionId} className="sr-only">{description}. Les absences ne sont pas reliées par le tracé. Utilisez les flèches gauche et droite, Home et End pour parcourir toutes les dates, y compris celles sans mesure.</p><span className="health-chart-range" aria-hidden="true"><b>{formatChartValue(max, unit, valueFormat)}</b><b>{formatChartValue(min, unit, valueFormat)}</b></span></div>;
}

const stageClass: Record<SleepStageSegment["type"], string> = { AWAKE: "awake", LIGHT: "light", DEEP: "deep", REM: "rem", ASLEEP: "light", RESTLESS: "awake" };

export function SleepStageTimeline({ stages }: { stages: SleepStageSegment[] }) {
  if (!stages.length) return <p className="health-empty">Les phases de sommeil ne sont pas disponibles pour cette nuit.</p>;
  const durations = stages.map((stage) => {
    const duration = Date.parse(stage.endTime) - Date.parse(stage.startTime);
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  });
  const safeDurations = durations.map((duration) => duration ?? 1);
  const total = safeDurations.reduce((sum, duration) => sum + duration, 0);
  const labels: Record<SleepStageSegment["type"], string> = { AWAKE: "Éveillé", LIGHT: "Léger", DEEP: "Profond", REM: "REM", ASLEEP: "Léger", RESTLESS: "Agité" };
  const description = `Séquence des phases de sommeil. Durée totale : ${formatDurationMs(durations.reduce<number | null>((sum, duration) => sum === null || duration === null ? null : sum + duration, 0))}. ${stages.map((stage, index) => `${labels[stage.type]} : ${formatDurationMs(durations[index])}`).join(" ; ")}`;
  return <div className="sleep-stage-chart">
    <div className="sleep-stage-axis" aria-hidden="true"><span>Éveillé</span><span>REM</span><span>Léger</span><span>Profond</span></div>
    <div className="sleep-stage-timeline" role="img" aria-label={description}>
      {stages.map((stage, index) => <span key={`${stage.startTime}-${index}`} className={`sleep-stage-segment sleep-stage-segment--${stageClass[stage.type]}`} style={{ flexGrow: safeDurations[index] / total }} />)}
    </div><p className="sr-only">{description}</p>
  </div>;
}

export function SleepStageDistribution({ stages }: { stages: Array<{ label: string; value: number | null; tone: string }> }) {
  const measured = stages.some((stage) => typeof stage.value === "number" && Number.isFinite(stage.value));
  if (!measured) return <p className="health-empty">La répartition des phases n’est pas disponible.</p>;
  const valueText = (value: number | null) => value === null || !Number.isFinite(value) ? "Indisponible" : `${value.toFixed(1)} %`;
  const description = `Répartition des phases : ${stages.map((stage) => `${stage.label} ${valueText(stage.value)}`).join(", ")}.`;
  return <div><div className="stage-distribution" role="img" aria-label={description}>
    {stages.filter((stage) => typeof stage.value === "number" && Number.isFinite(stage.value) && stage.value > 0).map((stage) => <span key={stage.label} className={`stage-distribution__segment stage-distribution__segment--${stage.tone}`} style={{ width: `${Math.min(100, Math.max(0, stage.value as number))}%` }} />)}
  </div><p className="sr-only">{description}</p><ul className="stage-legend">{stages.map((stage) => <li key={stage.label}><span className={`stage-dot stage-dot--${stage.tone}`} />{stage.label}<strong>{valueText(stage.value)}</strong></li>)}</ul></div>;
}

export function HeartRateCurve({ samples }: { samples: HeartRateSample[] }) {
  return <LineTrendChart points={samples.map((sample) => ({ date: sample.measuredAt, value: sample.bpm }))} label="Fréquence cardiaque" unit="bpm" />;
}

export function ZoneDistribution({ zones }: { zones: Array<{ label: string; minutes: number | null; tone: string }> }) {
  const measured = zones.some((zone) => typeof zone.minutes === "number" && Number.isFinite(zone.minutes));
  if (!measured) return <p className="health-empty">Aucun temps par zone cardiaque n’est disponible.</p>;
  const measuredZones = zones.filter((zone): zone is typeof zone & { minutes: number } => typeof zone.minutes === "number" && Number.isFinite(zone.minutes));
  const total = measuredZones.reduce((sum, zone) => sum + Math.max(0, zone.minutes), 0);
  const valueText = (minutes: number | null) => minutes === null || !Number.isFinite(minutes) ? "Indisponible" : `${Math.round(minutes)} min`;
  const description = `Temps dans les zones cardiaques : ${zones.map((zone) => `${zone.label} ${valueText(zone.minutes)}`).join(", ")}.`;
  return <div><div className="zone-distribution" role="img" aria-label={description}>
    {measuredZones.filter((zone) => zone.minutes > 0).map((zone) => <span key={zone.label} className={`zone-distribution__segment zone-distribution__segment--${zone.tone}`} style={{ width: `${total ? (Math.max(0, zone.minutes) / total) * 100 : 0}%` }} />)}
  </div><p className="sr-only">{description}</p><ul className="stage-legend">{zones.map((zone) => <li key={zone.label}><span className={`stage-dot stage-dot--${zone.tone}`} />{zone.label}<strong>{valueText(zone.minutes)}</strong></li>)}</ul></div>;
}
