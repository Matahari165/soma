import { ArrowRight, CalendarDays, Clock, Info, TrendingUp } from "lucide-react";
import Link from "next/link";

import type { DashboardSnapshot } from "@/domain/health";

export function WeeklyEffort({ data }: { data: DashboardSnapshot["weeklyEffort"] }) {
  const max = 80;
  return (
    <article className="widget">
      <div className="widget-header">
        <div>
          <span className="eyebrow">Weekly target</span>
          <h2>Effort balance</h2>
        </div>
        <span className="widget-icon"><TrendingUp size={18} /></span>
      </div>
      <div className="weekly-number">
        <strong>{data.current}</strong>
        <span>of {data.targetMin}–{data.targetMax}</span>
      </div>
      <div className="effort-bars" aria-label="Daily effort this week">
        {data.days.map((day, index) => (
          <div className="effort-day" key={`${day.label}-${index}`}>
            <div className="effort-track">
              <span
                className={day.today ? "effort-fill effort-fill--today" : "effort-fill"}
                style={{ height: `${Math.max((day.value / max) * 100, day.value ? 8 : 2)}%` }}
              />
            </div>
            <small className={day.today ? "day-label day-label--today" : "day-label"}>{day.label}</small>
          </div>
        ))}
      </div>
      <p className="widget-note">You are 72 points from your weekly minimum with three active days remaining.</p>
    </article>
  );
}

export function RecoveryTrend({ data }: { data: DashboardSnapshot["recoveryTrend"] }) {
  const points = data.map((item, index) => {
    const x = 8 + (index / (data.length - 1)) * 284;
    const y = 96 - ((item.value - 45) / 45) * 82;
    return `${x},${y}`;
  }).join(" ");

  return (
    <article className="widget">
      <div className="widget-header">
        <div>
          <span className="eyebrow">Seven days</span>
          <h2>Recovery trend</h2>
        </div>
        <Link href="/recovery" className="text-link">Explore <ArrowRight size={15} /></Link>
      </div>
      <svg className="trend-chart" viewBox="0 0 300 110" role="img" aria-label="Recovery increased from 58 to 72 over the last four days">
        <line x1="8" y1="50" x2="292" y2="50" className="trend-baseline" />
        <polyline points={points} className="trend-line" />
        {data.map((item, index) => {
          const [cx, cy] = points.split(" ")[index].split(",");
          return <circle key={item.label} cx={cx} cy={cy} r={index === data.length - 1 ? 4 : 2.5} className="trend-point" />;
        })}
      </svg>
      <div className="chart-labels" aria-hidden="true">
        <span>{data[0].label}</span><span>{data[3].label}</span><span>{data[6].label}</span>
      </div>
      <p className="widget-note">Back within your 30-day range after two lower days.</p>
    </article>
  );
}

export function SleepRegularity({ data }: { data: DashboardSnapshot["sleepRegularity"] }) {
  return (
    <article className="widget widget--regularity">
      <div className="widget-header">
        <div>
          <span className="eyebrow">Last seven nights</span>
          <h2>Sleep regularity</h2>
        </div>
        <span className="regularity-score">{data.consistency}%</span>
      </div>
      <div className="sleep-window">
        <div><MoonIcon /><span>Average bedtime</span><strong>{data.bedtime}</strong></div>
        <span className="sleep-window__line" aria-hidden="true" />
        <div><Clock size={17} /><span>Average wake time</span><strong>{data.wakeTime}</strong></div>
      </div>
      <p className="widget-note"><Info size={14} /> Your bedtime varies by about 38 minutes across the week.</p>
    </article>
  );
}

function MoonIcon() {
  return <CalendarDays size={17} />;
}
