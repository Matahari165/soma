"use client";

import { useState } from "react";

import type { HeartRateSample, SleepStageSegment } from "@/services/health-analytics";
import type { MetricPoint } from "@/domain/metrics/trends";

export function LineTrendChart({ points, label, target }: { points: MetricPoint[]; label: string; target?: number | null }) {
  const [activePoint, setActivePoint] = useState<{ date: string; value: number } | null>(null);
  const dated = points.map((point, index) => ({ ...point, index, timestamp: Date.parse(point.date) }));
  const available = dated.filter((point): point is typeof point & { value: number } => point.value !== null && Number.isFinite(point.timestamp));
  if (available.length < 2) return <p className="health-empty">Not enough complete readings for a trend.</p>;
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
  return <div className="health-line-chart-wrap"><svg className="health-line-chart" viewBox="0 0 300 104" role="img" tabIndex={0} aria-label={`${label} trend across ${available.length} measured days. Gaps are not connected. Use left and right arrow keys to inspect points.`} onFocus={() => setActivePoint(available.at(-1) ?? null)} onBlur={() => setActivePoint(null)} onKeyDown={(event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    moveActivePoint(event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "Home" ? "first" : "last");
  }}>
    <line x1="8" y1="92" x2="292" y2="92" className="health-chart-grid" />
    <line x1="8" y1={y(average)} x2="292" y2={y(average)} className="health-chart-average"><title>{`Average ${average.toFixed(1)}`}</title></line>
    {target !== null && target !== undefined && <line x1="8" y1={y(target)} x2="292" y2={y(target)} className="health-chart-target"><title>{`Target ${target}`}</title></line>}
    {segments.map((segment, index) => {
      const line = segment.map((point) => `${x(point.timestamp)},${y(point.value)}`).join(" ");
      const area = `${x(segment[0].timestamp)},92 ${line} ${x(segment.at(-1)?.timestamp ?? segment[0].timestamp)},92`;
      return <g key={`${segment[0].date}-${index}`}><polygon points={area} className="health-chart-area" /><polyline points={line} className="health-chart-line" /></g>;
    })}
    {available.map((point, index) => <circle key={`${point.date}-${point.value}-${index}`} cx={x(point.timestamp)} cy={y(point.value)} r={index === available.length - 1 ? 3.8 : 1.8} onPointerEnter={() => setActivePoint(point)} onPointerLeave={() => setActivePoint(null)} onClick={() => setActivePoint(point)} className={index === available.length - 1 ? "health-chart-point health-chart-point--latest" : "health-chart-point"}><title>{`${point.date}: ${point.value.toFixed(1)}`}</title></circle>)}
  </svg><span className="health-chart-range" aria-hidden="true"><b>{max.toFixed(1)}</b><b>{min.toFixed(1)}</b></span>{activePoint && <output className="health-chart-tooltip" aria-live="polite">{new Date(activePoint.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {activePoint.value.toFixed(1)}</output>}</div>;
}

const stageClass: Record<SleepStageSegment["type"], string> = { AWAKE: "awake", LIGHT: "light", DEEP: "deep", REM: "rem", ASLEEP: "light", RESTLESS: "awake" };

export function SleepStageTimeline({ stages }: { stages: SleepStageSegment[] }) {
  if (!stages.length) return <p className="health-empty">Sleep-stage processing is unavailable for this night.</p>;
  const durations = stages.map((stage) => Math.max(1, Date.parse(stage.endTime) - Date.parse(stage.startTime)));
  const safeDurations = durations.map((duration) => Number.isFinite(duration) && duration > 0 ? duration : 1);
  const total = safeDurations.reduce((sum, duration) => sum + duration, 0);
  return <div className="sleep-stage-chart">
    <div className="sleep-stage-axis" aria-hidden="true"><span>Awake</span><span>REM</span><span>Light</span><span>Deep</span></div>
    <div className="sleep-stage-timeline" role="img" aria-label="Sequence of sleep stages during the latest night">
      {stages.map((stage, index) => <span key={`${stage.startTime}-${index}`} className={`sleep-stage-segment sleep-stage-segment--${stageClass[stage.type]}`} style={{ flexGrow: safeDurations[index] / total }}><span className="sr-only">{stage.type}</span></span>)}
    </div>
  </div>;
}

export function SleepStageDistribution({ stages }: { stages: Array<{ label: string; value: number | null; tone: string }> }) {
  const available = stages.filter((stage): stage is { label: string; value: number; tone: string } => stage.value !== null && stage.value > 0);
  if (!available.length) return <p className="health-empty">No stage distribution is available.</p>;
  return <div><div className="stage-distribution" role="img" aria-label={available.map((stage) => `${stage.label} ${stage.value.toFixed(1)} percent`).join(", ")}>
    {available.map((stage) => <span key={stage.label} className={`stage-distribution__segment stage-distribution__segment--${stage.tone}`} style={{ width: `${stage.value}%` }} />)}
  </div><ul className="stage-legend">{available.map((stage) => <li key={stage.label}><span className={`stage-dot stage-dot--${stage.tone}`} />{stage.label}<strong>{stage.value.toFixed(1)}%</strong></li>)}</ul></div>;
}

export function HeartRateCurve({ samples }: { samples: HeartRateSample[] }) {
  return <LineTrendChart points={samples.map((sample) => ({ date: sample.measuredAt, value: sample.bpm }))} label="Heart rate" />;
}

export function ZoneDistribution({ zones }: { zones: Array<{ label: string; minutes: number | null; tone: string }> }) {
  const total = zones.reduce((sum, zone) => sum + (zone.minutes ?? 0), 0);
  if (!total) return <p className="health-empty">No heart-rate-zone time is available.</p>;
  return <div><div className="zone-distribution" role="img" aria-label={zones.map((zone) => `${zone.label} ${Math.round(zone.minutes ?? 0)} minutes`).join(", ")}>
    {zones.map((zone) => <span key={zone.label} className={`zone-distribution__segment zone-distribution__segment--${zone.tone}`} style={{ width: `${((zone.minutes ?? 0) / total) * 100}%` }} />)}
  </div><ul className="stage-legend">{zones.map((zone) => <li key={zone.label}><span className={`stage-dot stage-dot--${zone.tone}`} />{zone.label}<strong>{Math.round(zone.minutes ?? 0)} min</strong></li>)}</ul></div>;
}
