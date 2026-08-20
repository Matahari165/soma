import { Clock3, MoonStar, Sunrise } from "lucide-react";

import { calculateSignalFreshness } from "@/domain/health/freshness";
import type { HealthAnalytics, HealthMetricDay } from "@/services/health-analytics";

import { HealthPageShell } from "./health-page-shell";
import { SleepStageDistribution, SleepStageTimeline } from "./health-charts";
import { MetricReading } from "./metric-reading";
import { MetricTrendCard } from "./metric-trend-card";

const duration = (minutes: number) => `${Math.floor(Math.abs(minutes) / 60)}h ${Math.round(Math.abs(minutes) % 60)}m`;
const points = (days: HealthMetricDay[], key: keyof HealthMetricDay) => days.map((day) => ({ date: day.metric_date, value: typeof day[key] === "number" ? day[key] as number : null }));

function clock(value: string | null) {
  return value ? new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "—";
}

function clockMinutes(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  const minutes = date.getHours() * 60 + date.getMinutes();
  return minutes < 12 * 60 ? minutes + 1440 : minutes;
}

function timingRegularity(days: HealthMetricDay[], key: "bedtime" | "wake_time") {
  const values = days.slice(-14).map((day) => clockMinutes(day[key])).filter((value): value is number => value !== null);
  if (values.length < 3) return null;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const averageDeviation = values.reduce((sum, value) => sum + Math.abs(value - average), 0) / values.length;
  return Math.round(Math.max(0, 100 - (averageDeviation / 120) * 100));
}

export function SleepDetails({ data }: { data: HealthAnalytics }) {
  const latest = data.days.findLast((day) => day.sleep_minutes !== null && day.sleep_minutes > 0);
  const score = data.scores.findLast((item) => item.kind === "sleep" && item.score_date === latest?.metric_date)?.score ?? null;
  const target = latest?.sleep_need_minutes ?? null;
  const debt = latest?.daily_sleep_debt_minutes ?? null;
  const bedtimeRegularity = timingRegularity(data.days, "bedtime");
  const wakeRegularity = timingRegularity(data.days, "wake_time");
  const freshness = calculateSignalFreshness({ measuredAt: latest?.source_freshness?.byType?.sleep ?? latest?.source_freshness?.latestMeasuredAt ?? latest?.metric_date, importedAt: data.importedAt, coverage: latest ? [latest.sleep_minutes, latest.sleep_regularity, score].filter((value) => value !== null).length / 3 : 0 });
  return <HealthPageShell kind="sleep" title="Sleep" description="How long, how well, and how consistently you slept." score={score} freshness={freshness} timezone={data.timezone}>
    {latest ? <>
      <section className="health-primary-grid" aria-label="Latest sleep summary">
        <article className="health-primary-card health-primary-card--featured"><span>Total sleep</span><MetricReading value={latest.sleep_minutes === null ? "—" : duration(latest.sleep_minutes)} /><p>{target === null ? "Target is being estimated." : `Target ${duration(target)} · ${debt === null ? "gap unavailable" : debt > 0 ? `${duration(debt)} short` : `${duration(debt)} above target`}`}</p></article>
        <article className="health-primary-card"><span>Efficiency</span><MetricReading value={latest.sleep_efficiency === null ? "—" : latest.sleep_efficiency.toFixed(1)} unit={latest.sleep_efficiency === null ? undefined : "%"} /></article>
        <article className="health-primary-card"><span>Awake</span><MetricReading value={latest.sleep_awake_minutes === null ? "—" : Math.round(latest.sleep_awake_minutes)} unit={latest.sleep_awake_minutes === null ? undefined : "min"} /><p>{latest.sleep_awake_percent === null ? "Relative share unavailable." : `${latest.sleep_awake_percent.toFixed(1)}% of the measured sleep period.`}</p></article>
        <article className="health-primary-card"><span>Fragmentation</span><MetricReading value={latest.sleep_fragmentation === null ? "—" : latest.sleep_fragmentation.toFixed(1)} unit={latest.sleep_fragmentation === null ? undefined : "/h"} /><p>{latest.sleep_awakenings === null ? "Awakenings unavailable." : `${Math.round(latest.sleep_awakenings)} awake segments detected.`}</p></article>
        <article className="health-primary-card"><span>Sleep debt</span><MetricReading value={latest.cumulative_sleep_debt_minutes === null ? "—" : duration(latest.cumulative_sleep_debt_minutes)} /></article>
      </section>

      <section className="health-panel"><div className="health-section-heading"><div><span className="eyebrow">Latest night</span><h2>Sleep architecture</h2></div><span className="quality-pill">Measured stages</span></div><SleepStageTimeline stages={data.latestSleepStages} /><SleepStageDistribution stages={[
        { label: "Deep", value: latest.sleep_deep_percent, tone: "deep" },
        { label: "REM", value: latest.sleep_rem_percent, tone: "rem" },
        { label: "Light", value: latest.sleep_light_percent, tone: "light" },
        { label: "Awake", value: latest.sleep_awake_percent, tone: "awake" },
      ]} /></section>

      <section className="health-timing-grid">
        <article><MoonStar size={20} aria-hidden="true" /><span>Bedtime</span><strong>{clock(latest.bedtime)}</strong><p>{bedtimeRegularity === null ? "Regularity pending" : `${bedtimeRegularity}% bedtime regularity`}</p></article>
        <article><Sunrise size={20} aria-hidden="true" /><span>Wake time</span><strong>{clock(latest.wake_time)}</strong><p>{wakeRegularity === null ? "Regularity pending" : `${wakeRegularity}% wake-time regularity`}</p></article>
        <article><Clock3 size={20} aria-hidden="true" /><span>Combined timing</span><strong>{latest.sleep_regularity === null ? "—" : `${Math.round(latest.sleep_regularity)}%`}</strong></article>
      </section>

      <section className="health-trends-block" aria-labelledby="sleep-trends-heading"><div className="health-section-heading"><div><span className="eyebrow">Last 30 days</span><h2 id="sleep-trends-heading">Sleep trends</h2></div></div><div className="metric-trend-grid">
        <MetricTrendCard label="Total sleep" points={points(data.days, "sleep_minutes")} direction="higher_is_better" format={(value) => duration(value)} target={target} />
        <MetricTrendCard label="Efficiency" points={points(data.days, "sleep_efficiency")} unit="%" direction="higher_is_better" />
        <MetricTrendCard label="Awake share" points={points(data.days, "sleep_awake_percent")} unit="%" direction="lower_is_better" />
        <MetricTrendCard label="Fragmentation" points={points(data.days, "sleep_fragmentation")} unit="/h" direction="lower_is_better" />
        <MetricTrendCard label="Cumulative debt" points={points(data.days, "cumulative_sleep_debt_minutes")} direction="lower_is_better" format={(value) => duration(value)} />
      </div></section>
    </> : <section className="health-panel health-empty"><MoonStar size={24} aria-hidden="true" /><div><h2>No sleep data yet</h2><p>Sync one complete sleep session to begin.</p></div></section>}
  </HealthPageShell>;
}
