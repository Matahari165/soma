import { ArrowUpRight, Clock, MoonStar } from "lucide-react";
import Link from "next/link";

import type { DashboardSnapshot } from "@/domain/health";

export function WeeklyEffort({ data }: { data: DashboardSnapshot["weeklyEffort"] }) {
  const max = 80;
  const hasActivity = data.days.some((day) => day.value !== null);
  return (
    <Link className="widget widget--clickable" href="/activity" aria-label="Open activity details">
      <div className="widget-header">
        <div>
          <h3>Weekly load</h3>
        </div>
        <ArrowUpRight className="widget-open" size={18} aria-hidden="true" />
      </div>
      {hasActivity ? <>
        <div className="weekly-number">
          <strong>{data.current}</strong>
          <span>accumulated points</span>
        </div>
        <div className="effort-bars" aria-label="Daily effort this week">
          {data.days.map((day, index) => (
            <div className="effort-day" key={`${day.label}-${index}`}>
              <div className="effort-track">
                {day.value === null ? <span className="effort-missing" /> : <span
                  className={day.today ? "effort-fill effort-fill--today" : "effort-fill"}
                  style={{ height: `${Math.min(100, Math.max((day.value / max) * 100, day.value ? 8 : 2))}%` }}
                />}
              </div>
              <small className={day.today ? "day-label day-label--today" : "day-label"}>{day.label}</small>
            </div>
          ))}
        </div>
        <p className="widget-note">Sum of measured daily load. Recovery remains a separate signal.</p>
      </> : <WidgetEmpty title="No activity data yet" description="Sync Google Health to build your weekly effort view." />}
    </Link>
  );
}

export function RecoveryTrend({ data }: { data: DashboardSnapshot["recoveryTrend"] }) {
  const values = data.map((item) => item.value).filter((value): value is number => value !== null);
  const lowerBound = values.length ? Math.max(0, Math.min(...values) - 6) : 0;
  const upperBound = values.length ? Math.min(100, Math.max(...values) + 6) : 100;
  const range = Math.max(upperBound - lowerBound, 1);
  const chartPoints = data.map((item, index) => {
    const x = data.length === 1 ? 150 : 8 + (index / (data.length - 1)) * 284;
    const y = item.value === null ? null : 96 - ((Math.min(upperBound, Math.max(lowerBound, item.value)) - lowerBound) / range) * 82;
    return { ...item, x, y };
  });
  const segments = chartPoints.reduce<Array<typeof chartPoints>>((output, point) => {
    if (point.y === null) return [...output, []];
    if (!output.length) return [[point]];
    output[output.length - 1].push(point);
    return output;
  }, []).filter((segment) => segment.length);
  const availablePoints = chartPoints.filter((point): point is typeof point & { value: number; y: number } => point.value !== null && point.y !== null);
  const first = availablePoints.at(0);
  const last = availablePoints.at(-1);
  const weeklyDelta = first && last ? last.value - first.value : null;
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const averageY = average === null ? 50 : 96 - ((average - lowerBound) / range) * 82;
  const chartLabels = Array.from(new Set([
    first?.label,
    data[Math.floor((data.length - 1) / 2)]?.label,
    last?.label,
  ].filter((label): label is string => Boolean(label))));
  const chartDescription = first && last
    ? data.length === 1
      ? `Latest recovery score: ${first.value} out of 100`
      : `Recovery trend from ${first.value} to ${last.value}`
    : "Recovery trend";

  return (
    <Link className="widget widget--clickable" href="/recovery" aria-label="Open recovery details">
      <div className="widget-header">
        <div>
          <h3>Recovery trend</h3>
        </div>
        <ArrowUpRight className="widget-open" size={18} aria-hidden="true" />
      </div>
      {data.length ? <>
        <div className="recovery-current"><strong>{last?.value}</strong><span>/100</span>{weeklyDelta !== null && <small>{weeklyDelta > 0 ? "+" : ""}{weeklyDelta} this week</small>}</div>
        <svg className="trend-chart" viewBox="0 0 300 110" role="img" aria-label={chartDescription}>
          <line x1="8" y1={averageY} x2="292" y2={averageY} className="trend-baseline"><title>{average === null ? "Average unavailable" : `Weekly average ${Math.round(average)}`}</title></line>
          {segments.map((segment, segmentIndex) => {
            const points = segment.map(({ x, y }) => `${x},${y}`).join(" ");
            const areaPoints = `${segment[0].x},96 ${points} ${segment.at(-1)?.x ?? segment[0].x},96`;
            return <g key={`${segment[0].label}-${segmentIndex}`}><polygon points={areaPoints} className="trend-area" /><polyline points={points} className="trend-line" /></g>;
          })}
          {availablePoints.map((item, index) => <circle key={`${item.label}-${index}`} cx={item.x} cy={item.y} r={index === availablePoints.length - 1 ? 4 : 2.5} className="trend-point"><title>{`${item.label}: ${item.value} out of 100`}</title></circle>)}
        </svg>
        <div className="chart-labels" aria-hidden="true">
          {chartLabels.map((label) => <span key={label}>{label}</span>)}
        </div>
      </> : <WidgetEmpty title="No recovery data yet" description="Wear your device overnight and sync to begin your trend." />}
    </Link>
  );
}

export function SleepRegularity({ data }: { data: DashboardSnapshot["sleepRegularity"] }) {
  const hasSleepWindow = data.bedtime !== "—" || data.wakeTime !== "—";
  const hasConsistency = data.consistency !== null;
  return (
    <Link className="widget widget--regularity widget--clickable" href="/sleep" aria-label="Open sleep details">
      <div className="widget-header">
        <div>
          <h3>Sleep regularity</h3>
        </div>
        <span className="regularity-score" aria-label={hasConsistency ? `${data.consistency} percent regularity` : "Regularity baseline pending"}>{hasConsistency ? `${data.consistency}%` : "—"}<ArrowUpRight className="widget-open" size={16} aria-hidden="true" /></span>
      </div>
      {hasSleepWindow ? <>{hasConsistency && <span className="regularity-track" aria-hidden="true"><span style={{ width: `${data.consistency}%` }} /></span>}<div className="sleep-window">
        <div><MoonIcon /><span>Average bedtime</span><strong>{data.bedtime}</strong></div>
        <span className="sleep-window__line" aria-hidden="true" />
        <div><Clock size={17} /><span>Average wake time</span><strong>{data.wakeTime}</strong></div>
      </div>
      {!hasConsistency && <p className="widget-note">At least three complete nights are needed.</p>}</> : <WidgetEmpty title="Sleep baseline pending" description="Three complete nights are needed." />}
    </Link>
  );
}

function MoonIcon() {
  return <MoonStar size={17} />;
}

function WidgetEmpty({ title, description }: { title: string; description: string }) {
  return <div className="widget-empty" role="status"><strong>{title}</strong><p>{description}</p></div>;
}
