import { Clock3, MoonStar, Sunrise } from "lucide-react";

import type { HealthAnalytics, HealthMetricDay } from "@/services/health-analytics";

import { HealthPageShell } from "./health-page-shell";
import { SleepStageDistribution, SleepStageTimeline } from "./health-charts";
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
  const latest = data.days.at(-1);
  const score = data.scores.filter((item) => item.kind === "sleep").at(-1)?.score ?? null;
  const target = latest?.sleep_need_minutes ?? null;
  const debt = latest?.daily_sleep_debt_minutes ?? null;
  const bedtimeRegularity = timingRegularity(data.days, "bedtime");
  const wakeRegularity = timingRegularity(data.days, "wake_time");
  return <HealthPageShell eyebrow="Last complete night" title="Sleep" description="Duration, continuity, timing and stages — always compared with your personal history." score={score} scoreLabel="Sleep score">
    {latest ? <>
      <section className="health-primary-grid" aria-label="Latest sleep summary">
        <article className="health-primary-card health-primary-card--featured"><span>Total sleep</span><strong>{latest.sleep_minutes === null ? "—" : duration(latest.sleep_minutes)}</strong><p>{target === null ? "Target is being estimated." : `Target ${duration(target)} · ${debt === null ? "gap unavailable" : debt > 0 ? `${duration(debt)} short` : `${duration(debt)} above target`}`}</p></article>
        <article className="health-primary-card"><span>Efficiency</span><strong>{latest.sleep_efficiency === null ? "—" : `${latest.sleep_efficiency.toFixed(1)}%`}</strong><p>Time asleep divided by the measured sleep period.</p></article>
        <article className="health-primary-card"><span>Time to sleep</span><strong>{latest.sleep_latency_minutes === null ? "—" : `${Math.round(latest.sleep_latency_minutes)} min`}</strong><p>Measured latency after going to bed.</p></article>
        <article className="health-primary-card"><span>Awake</span><strong>{latest.sleep_awake_minutes === null ? "—" : `${Math.round(latest.sleep_awake_minutes)} min`}</strong><p>{latest.sleep_awake_percent === null ? "Relative share unavailable." : `${latest.sleep_awake_percent.toFixed(1)}% of the measured sleep period.`}</p></article>
        <article className="health-primary-card"><span>Fragmentation</span><strong>{latest.sleep_fragmentation === null ? "—" : `${latest.sleep_fragmentation.toFixed(1)}/h`}</strong><p>{latest.sleep_awakenings === null ? "Awakenings unavailable." : `${Math.round(latest.sleep_awakenings)} awake segments detected.`}</p></article>
        <article className="health-primary-card"><span>Sleep debt</span><strong>{latest.cumulative_sleep_debt_minutes === null ? "—" : duration(latest.cumulative_sleep_debt_minutes)}</strong><p>Rolling 14-day debt; extra sleep repays recent deficits.</p></article>
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
        <article><Clock3 size={20} aria-hidden="true" /><span>Combined timing</span><strong>{latest.sleep_regularity === null ? "—" : `${Math.round(latest.sleep_regularity)}%`}</strong><p>Bedtime and wake time compared with recent nights.</p></article>
      </section>

      <section className="metric-trend-grid" aria-label="Sleep trends">
        <MetricTrendCard label="Total sleep" points={points(data.days, "sleep_minutes")} direction="higher_is_better" description="Compared with your prior complete nights." format={(value) => duration(value)} target={target} />
        <MetricTrendCard label="Efficiency" points={points(data.days, "sleep_efficiency")} unit="%" direction="higher_is_better" description="A relative view of how much of the sleep period was spent asleep." />
        <MetricTrendCard label="Sleep latency" points={points(data.days, "sleep_latency_minutes")} unit="min" direction="lower_is_better" description="Short-term changes matter more than one isolated night." />
        <MetricTrendCard label="Awake share" points={points(data.days, "sleep_awake_percent")} unit="%" direction="lower_is_better" description="Awake time expressed relative to the measured sleep period." />
        <MetricTrendCard label="Fragmentation" points={points(data.days, "sleep_fragmentation")} unit="/h" direction="lower_is_better" description="Awake segments per hour of measured sleep." />
        <MetricTrendCard label="Cumulative debt" points={points(data.days, "cumulative_sleep_debt_minutes")} direction="lower_is_better" description="Rolling 14-day gap after accounting for sleep surplus." format={(value) => duration(value)} />
      </section>
    </> : <section className="health-panel health-empty">Connect Google Health and sync complete sleep sessions to build this page.</section>}
  </HealthPageShell>;
}
