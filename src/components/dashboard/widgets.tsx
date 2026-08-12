import { ArrowRight, Clock, MoonStar, TrendingUp } from "lucide-react";
import Link from "next/link";

import type { DashboardSnapshot } from "@/domain/health";

export function WeeklyEffort({ data }: { data: DashboardSnapshot["weeklyEffort"] }) {
  const max = 80;
  const hasActivity = data.days.length > 0;
  const hasTarget = data.targetMin > 0 && data.targetMax >= data.targetMin;
  const remaining = Math.max(0, data.targetMin - data.current);
  const todayIndex = data.days.findIndex((day) => day.today);
  const activeDaysRemaining = todayIndex >= 0 ? data.days.slice(todayIndex + 1).length : 0;
  return (
    <article className="widget">
      <div className="widget-header">
        <div>
          <span className="eyebrow">Seven days</span>
          <h3>Effort range</h3>
        </div>
        <span className="widget-icon"><TrendingUp size={18} /></span>
      </div>
      {hasActivity ? <>
        <div className="weekly-number">
          <strong>{data.current}</strong>
          <span>{hasTarget ? `of ${data.targetMin}–${data.targetMax}` : "target building"}</span>
        </div>
        <div className="effort-bars" aria-label="Daily effort this week">
          {data.days.map((day, index) => (
            <div className="effort-day" key={`${day.label}-${index}`}>
              <div className="effort-track">
                <span
                  className={day.today ? "effort-fill effort-fill--today" : "effort-fill"}
                  style={{ height: `${Math.min(100, Math.max((day.value / max) * 100, day.value ? 8 : 2))}%` }}
                />
              </div>
              <small className={day.today ? "day-label day-label--today" : "day-label"}>{day.label}</small>
            </div>
          ))}
        </div>
        <p className="widget-note">{hasTarget ? remaining ? `${remaining} points left · ${activeDaysRemaining} days` : "Weekly range reached" : "Target building"}</p>
      </> : <WidgetEmpty title="No activity data yet" description="Sync Google Health to build your weekly effort view." />}
    </article>
  );
}

export function RecoveryTrend({ data }: { data: DashboardSnapshot["recoveryTrend"] }) {
  const chartPoints = data.map((item, index) => {
    const x = data.length === 1 ? 150 : 8 + (index / (data.length - 1)) * 284;
    const y = 96 - (Math.min(100, Math.max(0, item.value)) / 100) * 82;
    return { ...item, x, y };
  });
  const points = chartPoints.map(({ x, y }) => `${x},${y}`).join(" ");
  const first = data.at(0);
  const last = data.at(-1);
  const chartLabels = Array.from(new Set([
    first?.label,
    data[Math.floor((data.length - 1) / 2)]?.label,
    last?.label,
  ].filter((label): label is string => Boolean(label))));
  const chartDescription = first && last
    ? data.length === 1
      ? `Recovery reading: ${first.value} out of 100`
      : `Recovery trend from ${first.value} to ${last.value} over ${data.length} readings`
    : "Recovery trend";

  return (
    <article className="widget">
      <div className="widget-header">
        <div>
          <span className="eyebrow">{data.length >= 7 ? "Seven days" : "Recent readings"}</span>
          <h3>Recovery trend</h3>
        </div>
        <Link href="/recovery" className="text-link">Explore <ArrowRight size={15} /></Link>
      </div>
      {data.length ? <>
        <svg className="trend-chart" viewBox="0 0 300 110" role="img" aria-label={chartDescription}>
          <line x1="8" y1="50" x2="292" y2="50" className="trend-baseline" />
          <polyline points={points} className="trend-line" />
          {chartPoints.map((item, index) => <circle key={`${item.label}-${index}`} cx={item.x} cy={item.y} r={index === data.length - 1 ? 4 : 2.5} className="trend-point"><title>{`${item.label}: ${item.value} out of 100`}</title></circle>)}
        </svg>
        <div className="chart-labels" aria-hidden="true">
          {chartLabels.map((label) => <span key={label}>{label}</span>)}
        </div>
      </> : <WidgetEmpty title="No recovery data yet" description="Wear your device overnight and sync to begin your trend." />}
    </article>
  );
}

export function SleepRegularity({ data }: { data: DashboardSnapshot["sleepRegularity"] }) {
  const hasSleepWindow = data.bedtime !== "—" || data.wakeTime !== "—";
  const hasConsistency = data.consistency !== null;
  return (
    <article className="widget widget--regularity">
      <div className="widget-header">
        <div>
          <span className="eyebrow">Recent nights</span>
          <h3>Sleep regularity</h3>
        </div>
        <span className="regularity-score" aria-label={hasConsistency ? `${data.consistency} percent regularity` : "Regularity baseline pending"}>{hasConsistency ? `${data.consistency}%` : "—"}</span>
      </div>
      {hasSleepWindow ? <><div className="sleep-window">
        <div><MoonIcon /><span>Average bedtime</span><strong>{data.bedtime}</strong></div>
        <span className="sleep-window__line" aria-hidden="true" />
        <div><Clock size={17} /><span>Average wake time</span><strong>{data.wakeTime}</strong></div>
      </div>
      {!hasConsistency && <p className="widget-note">At least three complete nights are needed.</p>}</> : <WidgetEmpty title="Sleep baseline pending" description="Three complete nights are needed." />}
    </article>
  );
}

function MoonIcon() {
  return <MoonStar size={17} />;
}

function WidgetEmpty({ title, description }: { title: string; description: string }) {
  return <div className="widget-empty" role="status"><strong>{title}</strong><p>{description}</p></div>;
}
