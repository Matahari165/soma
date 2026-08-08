import type { HeartRateSample, SleepStageSegment } from "@/services/health-analytics";

export function LineTrendChart({ values, label, target }: { values: Array<number | null>; label: string; target?: number | null }) {
  const available = values.map((value, index) => value === null ? null : { value, index }).filter((point): point is { value: number; index: number } => point !== null);
  if (available.length < 2) return <p className="health-empty">Not enough complete readings for a trend.</p>;
  const min = Math.min(...available.map((point) => point.value), target ?? Infinity);
  const max = Math.max(...available.map((point) => point.value), target ?? -Infinity);
  const range = Math.max(max - min, 1);
  const x = (index: number) => 8 + (index / Math.max(values.length - 1, 1)) * 284;
  const y = (value: number) => 92 - ((value - min) / range) * 76;
  const points = available.map((point) => `${x(point.index)},${y(point.value)}`).join(" ");
  const areaPoints = `8,92 ${points} 292,92`;
  const average = available.reduce((sum, point) => sum + point.value, 0) / available.length;
  return <svg className="health-line-chart" viewBox="0 0 300 104" role="img" aria-label={`${label} trend across ${available.length} complete readings`}>
    <line x1="8" y1="92" x2="292" y2="92" className="health-chart-grid" />
    <line x1="8" y1={y(average)} x2="292" y2={y(average)} className="health-chart-average"><title>{`Average ${average.toFixed(1)}`}</title></line>
    {target !== null && target !== undefined && <line x1="8" y1={y(target)} x2="292" y2={y(target)} className="health-chart-target"><title>{`Target ${target}`}</title></line>}
    <polygon points={areaPoints} className="health-chart-area" />
    <polyline points={points} className="health-chart-line" />
    {available.map((point, index) => <circle key={`${point.index}-${point.value}`} cx={x(point.index)} cy={y(point.value)} r={index === available.length - 1 ? 3.5 : 1.8} className="health-chart-point"><title>{`${point.value.toFixed(1)}`}</title></circle>)}
  </svg>;
}

const stageClass: Record<SleepStageSegment["type"], string> = { AWAKE: "awake", LIGHT: "light", DEEP: "deep", REM: "rem", ASLEEP: "light", RESTLESS: "awake" };

export function SleepStageTimeline({ stages }: { stages: SleepStageSegment[] }) {
  if (!stages.length) return <p className="health-empty">Sleep-stage processing is unavailable for this night.</p>;
  const durations = stages.map((stage) => Math.max(1, Date.parse(stage.endTime) - Date.parse(stage.startTime)));
  const safeDurations = durations.map((duration) => Number.isFinite(duration) && duration > 0 ? duration : 1);
  const total = safeDurations.reduce((sum, duration) => sum + duration, 0);
  return <div className="sleep-stage-timeline" role="img" aria-label="Sequence of sleep stages during the latest night">
    {stages.map((stage, index) => <span key={`${stage.startTime}-${index}`} className={`sleep-stage-segment sleep-stage-segment--${stageClass[stage.type]}`} style={{ flexGrow: safeDurations[index] / total }}><span className="sr-only">{stage.type}</span></span>)}
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
  return <LineTrendChart values={samples.map((sample) => sample.bpm)} label="Heart rate" />;
}

export function ZoneDistribution({ zones }: { zones: Array<{ label: string; minutes: number | null; tone: string }> }) {
  const total = zones.reduce((sum, zone) => sum + (zone.minutes ?? 0), 0);
  if (!total) return <p className="health-empty">No heart-rate-zone time is available.</p>;
  return <div><div className="zone-distribution" role="img" aria-label={zones.map((zone) => `${zone.label} ${Math.round(zone.minutes ?? 0)} minutes`).join(", ")}>
    {zones.map((zone) => <span key={zone.label} className={`zone-distribution__segment zone-distribution__segment--${zone.tone}`} style={{ width: `${((zone.minutes ?? 0) / total) * 100}%` }} />)}
  </div><ul className="stage-legend">{zones.map((zone) => <li key={zone.label}><span className={`stage-dot stage-dot--${zone.tone}`} />{zone.label}<strong>{Math.round(zone.minutes ?? 0)} min</strong></li>)}</ul></div>;
}
