import { Clock3, MoonStar, Sunrise } from "lucide-react";

import { ScoreRing } from "@/components/dashboard/score-ring";
import { calculateSignalFreshness } from "@/domain/health/freshness";
import type { HealthAnalytics, HealthMetricDay } from "@/services/health-analytics";

import { HealthPageShell } from "./health-page-shell";
import { SleepStageDistribution, SleepStageTimeline } from "./health-charts";
import { AnimatedMetricReading, AnimatedValueText } from "./animated-value";
import { averageLast30Measured, formatAverage, formatDurationMinutes, metricTone } from "./health-metric-utils";
import { MetricTrendCard } from "./metric-trend-card";

const duration = (minutes: number) => formatDurationMinutes(minutes);
const points = (days: HealthMetricDay[], key: keyof HealthMetricDay) => days.map((day) => ({ date: day.metric_date, value: typeof day[key] === "number" ? day[key] as number : null }));
const restorativeSleepPoints = (days: HealthMetricDay[]) => days.map((day) => ({ date: day.metric_date, value: day.sleep_rem_minutes === null && day.sleep_deep_minutes === null ? null : (day.sleep_rem_minutes ?? 0) + (day.sleep_deep_minutes ?? 0) }));

function clock(value: string | null, timeZone: string) {
  return value ? new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "—";
}
function clockMinutes(value: string | null, timeZone: string) {
  if (!value) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const minutes = Number(parts.find((part) => part.type === "hour")?.value ?? 0) * 60 + Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return minutes < 12 * 60 ? minutes + 1440 : minutes;
}

function timingRegularity(days: HealthMetricDay[], key: "bedtime" | "wake_time", timeZone: string) {
  const values = days.slice(-14).map((day) => clockMinutes(day[key], timeZone)).filter((value): value is number => value !== null);
  if (values.length < 3) return null;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const averageDeviation = values.reduce((sum, value) => sum + Math.abs(value - average), 0) / values.length;
  return Math.round(Math.max(0, 100 - (averageDeviation / 120) * 100));
}

function usualClockMinutes(days: HealthMetricDay[], key: "bedtime" | "wake_time", timeZone: string) {
  const values = days.slice(-30).map((day) => clockMinutes(day[key], timeZone)).filter((value): value is number => value !== null);
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function formatClockMinutes(value: number | null) {
  if (value === null) return "—";
  const normalized = ((value % 1440) + 1440) % 1440;
  const date = new Date(Date.UTC(2000, 0, 1, Math.floor(normalized / 60), normalized % 60));
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" }).format(date);
}

export function SleepDetails({ data }: { data: HealthAnalytics }) {
  const latest = data.days.findLast((day) => day.sleep_minutes !== null && day.sleep_minutes > 0);
  const score = data.scores.findLast((item) => item.kind === "sleep" && item.score_date === latest?.metric_date)?.score ?? null;
  const target = latest?.sleep_need_minutes ?? null;
  const debt = latest?.cumulative_sleep_debt_minutes ?? null;
  const averageSleep = latest ? averageLast30Measured(data.days, "sleep_minutes", latest.metric_date) : null;
  const averageEfficiency = latest ? averageLast30Measured(data.days, "sleep_efficiency", latest.metric_date) : null;
  const averageDebt = latest ? averageLast30Measured(data.days, "cumulative_sleep_debt_minutes", latest.metric_date) : null;
  const sleepTone = metricTone(latest?.sleep_minutes ?? null, averageSleep, "higher_is_better");
  const efficiencyTone = metricTone(latest?.sleep_efficiency ?? null, averageEfficiency, "higher_is_better");
  const debtTone = metricTone(debt, averageDebt, "lower_is_better");
  const bedtimeRegularity = timingRegularity(data.days, "bedtime", data.timezone);
  const wakeRegularity = timingRegularity(data.days, "wake_time", data.timezone);
  const usualWakeMinutes = usualClockMinutes(data.days, "wake_time", data.timezone);
  const recommendedWakeMinutes = usualWakeMinutes ?? clockMinutes(latest?.wake_time ?? null, data.timezone);
  const tonightBedtime = recommendedWakeMinutes === null ? null : target === null ? null : recommendedWakeMinutes - target;
  const freshness = calculateSignalFreshness({ measuredAt: latest?.source_freshness?.byType?.sleep ?? latest?.source_freshness?.latestMeasuredAt ?? latest?.metric_date, importedAt: data.importedAt, coverage: latest ? [latest.sleep_minutes, latest.sleep_regularity, score].filter((value) => value !== null).length / 3 : 0 });
  return <HealthPageShell kind="sleep" title="Sleep" description="How long, how well, and how consistently you slept." score={score} freshness={freshness} timezone={data.timezone} heroMetrics={<>
    <div className="health-hero-stat health-hero-stat--regularity"><ScoreRing kind="sleep" label="Regularity" score={latest?.sleep_regularity ?? null} animate /></div>
    <div className={`health-hero-stat health-hero-stat--debt metric-tone--${debtTone}`}><span>Sleep debt</span><AnimatedMetricReading value={debt} format="duration" className={`metric-reading--${debtTone}`} /><div className="health-debt-comparison"><span><small>Current</small><strong>{formatDurationMinutes(debt)}</strong></span><i aria-hidden="true">→</i><span><small>30d avg</small><strong>{formatDurationMinutes(averageDebt)}</strong></span></div></div>
  </>}>
    {latest ? <>
      <section className="health-primary-grid" aria-label="Latest sleep summary">
        <article className={`health-primary-card health-primary-card--featured health-primary-card--centered metric-tone--${sleepTone}`}><span>Total sleep</span><AnimatedMetricReading value={latest.sleep_minutes} format="duration" className={`metric-reading--${sleepTone}`} /><p className="health-primary-card__average">30-day average · {formatDurationMinutes(averageSleep)}</p></article>
        <article className={`health-primary-card health-primary-card--centered health-primary-card--connected health-primary-card--connected-start metric-tone--${efficiencyTone}`}><span>Efficiency</span><AnimatedMetricReading value={latest.sleep_efficiency} format="decimal" unit="%" className={`metric-reading--${efficiencyTone}`} /><p className="health-primary-card__average">30-day average · {formatAverage(averageEfficiency, "decimal", 1)}%</p></article>
        <article className={`health-primary-card health-primary-card--centered health-primary-card--connected health-primary-card--connected-end metric-tone--${efficiencyTone}`}><span>Awake</span><AnimatedMetricReading value={latest.sleep_awake_minutes} format="number" unit="min" decimals={0} /><p className="health-primary-card__average health-primary-card__average--spacer" aria-hidden="true">Linked to efficiency</p></article>
        <article className="health-primary-card health-primary-card--centered health-primary-card--recommendation"><span>Tonight&apos;s optimal bedtime</span><strong className="metric-reading"><span>{formatClockMinutes(tonightBedtime)}</span></strong><p>{tonightBedtime === null || target === null ? "Target bedtime unavailable." : <>To wake at {formatClockMinutes(recommendedWakeMinutes)} and reach your {formatDurationMinutes(target)} target.</>}</p></article>
      </section>

      <section className="health-timing-grid">
        <article><MoonStar size={20} aria-hidden="true" /><span>Bedtime</span><strong>{clock(latest.bedtime, data.timezone)}</strong><p>{bedtimeRegularity === null ? "Regularity pending" : <><AnimatedValueText value={bedtimeRegularity} suffix="%" decimals={0} /> bedtime regularity</>}</p></article>
        <article><Sunrise size={20} aria-hidden="true" /><span>Wake time</span><strong>{clock(latest.wake_time, data.timezone)}</strong><p>{wakeRegularity === null ? "Regularity pending" : <><AnimatedValueText value={wakeRegularity} suffix="%" decimals={0} /> wake-time regularity</>}</p></article>
        <article><Clock3 size={20} aria-hidden="true" /><span>Combined timing</span><strong><AnimatedValueText value={latest.sleep_regularity} suffix="%" decimals={0} /></strong></article>
      </section>

      <section className="health-trends-block" aria-labelledby="sleep-trends-heading"><div className="health-section-heading"><div><span className="eyebrow">Last 30 days</span><h2 id="sleep-trends-heading">Sleep trends</h2></div></div><div className="metric-trend-grid">
        <MetricTrendCard label="Total sleep" points={points(data.days, "sleep_minutes")} direction="higher_is_better" format={(value) => duration(value)} target={target} animateCurrent animationFormat="duration" />
        <MetricTrendCard label="Efficiency" points={points(data.days, "sleep_efficiency")} unit="%" direction="higher_is_better" animateCurrent animationFormat="decimal" />
        <MetricTrendCard label="Cumulative debt" points={points(data.days, "cumulative_sleep_debt_minutes")} direction="lower_is_better" format={(value) => duration(value)} animateCurrent animationFormat="duration" />
        <MetricTrendCard label="Fragmentation" points={points(data.days, "sleep_fragmentation")} unit="/h" direction="lower_is_better" animateCurrent animationFormat="decimal" />
        <MetricTrendCard label="Sleep regularity" points={points(data.days, "sleep_regularity")} unit="%" direction="higher_is_better" animateCurrent animationFormat="decimal" />
        <MetricTrendCard label="REM + deep sleep" points={restorativeSleepPoints(data.days)} direction="higher_is_better" format={(value) => duration(value)} animateCurrent animationFormat="duration" />
      </div></section>

      <section className="health-panel"><div className="health-section-heading"><div><span className="eyebrow">Latest night</span><h2>Sleep architecture</h2></div><span className="quality-pill">Measured stages</span></div><SleepStageTimeline stages={data.latestSleepStages} /><SleepStageDistribution stages={[
        { label: "Deep", value: latest.sleep_deep_percent, tone: "deep" },
        { label: "REM", value: latest.sleep_rem_percent, tone: "rem" },
        { label: "Light", value: latest.sleep_light_percent, tone: "light" },
        { label: "Awake", value: latest.sleep_awake_percent, tone: "awake" },
      ]} /></section>
    </> : <section className="health-panel health-empty"><MoonStar size={24} aria-hidden="true" /><div><h2>No sleep data yet</h2><p>Sync one complete sleep session to begin.</p></div></section>}
  </HealthPageShell>;
}
