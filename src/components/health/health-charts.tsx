"use client";

import { useId, useState } from "react";

import type { HeartRateSample, SleepStageSegment } from "@/services/health-analytics";
import type { MetricPoint } from "@/domain/metrics/trends";

import styles from "./health-charts.module.css";

function formatChartValue(value: number | null, unit?: string) {
  if (value === null || !Number.isFinite(value)) return "Donnée absente";
  return `${value.toFixed(1)}${unit ? ` ${unit}` : ""}`;
}

function chartDescription(label: string, points: MetricPoint[], unit?: string) {
  return `${label}. ${points.map((point) => `${point.date} : ${formatChartValue(point.value, unit)}`).join(" ; ")}`;
}

function formatDurationMs(value: number | null) {
  if (value === null || !Number.isFinite(value) || value <= 0) return "durée indisponible";
  const minutes = Math.max(1, Math.round(value / 60_000));
  return `${minutes} min`;
}

export function LineTrendChart({ points, label, target, unit }: { points: MetricPoint[]; label: string; target?: number | null; unit?: string }) {
  const titleId = useId();
  const descriptionId = useId();
  const [activePoint, setActivePoint] = useState<{ date: string; value: number } | null>(null);
  const dated = points.map((point) => ({ ...point, timestamp: Date.parse(point.date) }));
  const available = dated.filter((point): point is typeof point & { value: number } => typeof point.value === "number" && Number.isFinite(point.value) && Number.isFinite(point.timestamp));
  const description = chartDescription(label, points, unit);
  if (available.length < 2) return <div className="health-line-chart-wrap"><p className="health-empty">Pas assez de mesures complètes pour afficher une tendance.</p><p id={descriptionId} className="sr-only">{description}</p></div>;
  const rawMin = Math.min(...available.map((point) => point.value), target ?? Infinity);
  const rawMax = Math.max(...available.map((point) => point.value), target ?? -Infinity);
  const average = available.reduce((sum, point) => sum + point.value, 0) / available.length;
  const range = Math.max(rawMax - rawMin, Math.abs(average) * 0.1, 1);
  const midpoint = (rawMin + rawMax) / 2;
  const min = midpoint - range / 2;
  const max = midpoint + range / 2;
  const firstTime = Math.min(...available.map((point) => point.timestamp));
  const lastTime = Math.max(...available.map((point) => point.timestamp));
  const x = (timestamp: number) => 8 + ((timestamp - firstTime) / Math.max(lastTime - firstTime, 1)) * 284;
  const y = (value: number) => 92 - ((value - min) / range) * 76;
  const segments: Array<typeof available> = [];
  let current: typeof available = [];
  for (const point of dated) {
    if (point.value === null || !Number.isFinite(point.timestamp)) {
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
  const moveActivePoint = (direction: -1 | 1 | "first" | "last") => {
    const currentIndex = activePoint ? available.findIndex((point) => point.date === activePoint.date && point.value === activePoint.value) : available.length - 1;
    const nextIndex = direction === "first" ? 0 : direction === "last" ? available.length - 1 : Math.min(available.length - 1, Math.max(0, currentIndex + direction));
    setActivePoint(available[nextIndex]);
  };
  return <div className="health-line-chart-wrap"><svg className={`${styles.lineChart} health-line-chart`} viewBox="0 0 300 104" role="img" tabIndex={0} aria-labelledby={titleId} aria-describedby={descriptionId} onFocus={() => setActivePoint(available.at(-1) ?? null)} onBlur={() => setActivePoint(null)} onKeyDown={(event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    moveActivePoint(event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "Home" ? "first" : "last");
  }}>
    <line x1="8" y1="92" x2="292" y2="92" className="health-chart-grid" />
    <line x1="8" y1={y(average)} x2="292" y2={y(average)} className="health-chart-average"><title>{`Moyenne ${average.toFixed(1)}`}</title></line>
    {target !== null && target !== undefined && <line x1="8" y1={y(target)} x2="292" y2={y(target)} className="health-chart-target"><title>{`Objectif ${target}`}</title></line>}
    {segments.map((segment, index) => {
      const line = segment.map((point) => `${x(point.timestamp)},${y(point.value)}`).join(" ");
      const area = `${x(segment[0].timestamp)},92 ${line} ${x(segment.at(-1)?.timestamp ?? segment[0].timestamp)},92`;
      return <g key={`${segment[0].date}-${index}`}><polygon points={area} className="health-chart-area" /><polyline points={line} className="health-chart-line" /></g>;
    })}
    {available.map((point, index) => <circle key={`${point.date}-${point.value}-${index}`} cx={x(point.timestamp)} cy={y(point.value)} r={index === available.length - 1 ? 3.8 : 1.8} onPointerEnter={() => setActivePoint(point)} onPointerLeave={() => setActivePoint(null)} onClick={() => setActivePoint(point)} className={index === available.length - 1 ? "health-chart-point health-chart-point--latest" : "health-chart-point"}><title>{`${point.date}: ${formatChartValue(point.value, unit)}`}</title></circle>)}
  </svg><span id={titleId} className="sr-only">{label} : tendance sur {available.length} jours mesurés</span><p id={descriptionId} className="sr-only">{description}. Les absences ne sont pas reliées. Utilisez les flèches gauche et droite pour parcourir les points.</p><span className="health-chart-range" aria-hidden="true"><b>{max.toFixed(1)}</b><b>{min.toFixed(1)}</b></span>{activePoint && <output className="health-chart-tooltip" aria-live="polite">{new Date(activePoint.date).toLocaleDateString("fr-FR", { month: "short", day: "numeric" })} · {formatChartValue(activePoint.value, unit)}</output>}</div>;
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
  const positiveZones = zones.map((zone) => ({ ...zone, safeMinutes: typeof zone.minutes === "number" && Number.isFinite(zone.minutes) ? Math.max(0, zone.minutes) : 0 }));
  const total = positiveZones.reduce((sum, zone) => sum + zone.safeMinutes, 0);
  const valueText = (minutes: number | null) => minutes === null || !Number.isFinite(minutes) ? "Indisponible" : `${Math.round(minutes)} min`;
  const description = `Temps dans les zones cardiaques : ${zones.map((zone) => `${zone.label} ${valueText(zone.minutes)}`).join(", ")}.`;
  return <div><div className="zone-distribution" role="img" aria-label={description}>
    {positiveZones.filter((zone) => zone.safeMinutes > 0).map((zone) => <span key={zone.label} className={`zone-distribution__segment zone-distribution__segment--${zone.tone}`} style={{ width: `${total ? (zone.safeMinutes / total) * 100 : 0}%` }} />)}
  </div><p className="sr-only">{description}</p><ul className="stage-legend">{zones.map((zone) => <li key={zone.label}><span className={`stage-dot stage-dot--${zone.tone}`} />{zone.label}<strong>{valueText(zone.minutes)}</strong></li>)}</ul></div>;
}
