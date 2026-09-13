import { MoonStar } from "lucide-react";

import { calculateSignalFreshness } from "@/domain/health/freshness";
import { recommendBedtimeFromAwake } from "@/domain/scores/sleep-need";
import type { HealthAnalytics, HealthMetricDay } from "@/services/health-analytics";

import styles from "./sleep-redesign.module.css";
import { HealthHeroScore, HealthPageShell } from "./health-page-shell";
import { SleepStageDistribution, SleepStageTimeline } from "./health-charts";
import { averageLast30Measured, formatDurationMinutes, latestSourceMeasuredAt, measuredCoverage, metricTone } from "./health-metric-utils";
import { MetricTrendCard } from "./metric-trend-card";
import { SleepRadar, type SleepRadarDimension } from "./sleep-radar";

const SLEEP_TARGET_MINUTES = 8 * 60 + 30;

function measured(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function points(days: HealthMetricDay[], key: keyof HealthMetricDay) {
  return days.map((day) => ({
    date: day.metric_date,
    value: typeof day[key] === "number" && Number.isFinite(day[key]) ? day[key] as number : null,
  }));
}

function restorativeSleepPoints(days: HealthMetricDay[]) {
  return days.map((day) => ({
    date: day.metric_date,
    value: measured(day.sleep_rem_minutes) && measured(day.sleep_deep_minutes)
      ? day.sleep_rem_minutes + day.sleep_deep_minutes
      : null,
  }));
}

function bedtimePoints(days: HealthMetricDay[], timeZone: string) {
  return days.map((day) => ({ date: day.metric_date, value: clockMinutes(day.bedtime, timeZone) }));
}

function hasSleepMeasurement(day: HealthMetricDay) {
  return [
    day.sleep_minutes,
    day.sleep_need_minutes,
    day.sleep_efficiency,
    day.sleep_regularity,
    day.sleep_latency_minutes,
    day.sleep_awake_minutes,
    day.sleep_awake_percent,
    day.sleep_awakenings,
    day.sleep_fragmentation,
    day.sleep_deep_minutes,
    day.sleep_deep_percent,
    day.sleep_rem_minutes,
    day.sleep_rem_percent,
    day.sleep_light_minutes,
    day.sleep_light_percent,
    day.daily_sleep_debt_minutes,
    day.cumulative_sleep_debt_minutes,
  ].some(measured);
}

function clock(value: string | null, timeZone: string) {
  return value ? new Intl.DateTimeFormat("fr-FR", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "—";
}

/** The previous night is kept adjacent to the following metric date. */
function clockMinutes(value: string | null, timeZone: string) {
  if (!value) return null;
  const parts = new Intl.DateTimeFormat("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const minutes = Number(parts.find((part) => part.type === "hour")?.value ?? 0) * 60 + Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return minutes < 12 * 60 ? minutes + 1440 : minutes;
}

function formatClockMinutes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const normalized = ((value % 1440) + 1440) % 1440;
  return `${Math.floor(normalized / 60)}:${String(Math.round(normalized % 60)).padStart(2, "0")}`;
}

function averageScoreLast30(scores: HealthAnalytics["scores"], endDate: string | undefined) {
  if (!endDate) return null;
  const end = new Date(`${endDate}T12:00:00.000Z`);
  if (!Number.isFinite(end.getTime())) return null;
  end.setUTCDate(end.getUTCDate() - 29);
  const startDate = end.toISOString().slice(0, 10);
  const values = scores
    .filter((item) => item.kind === "sleep" && item.score_date >= startDate && item.score_date <= endDate)
    .map((item) => item.score)
    .filter(measured);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function formatPercent(value: number | null) {
  return value === null || !Number.isFinite(value) ? "—" : `${Math.round(value)} %`;
}

function formatMinutesOnly(value: number | null) {
  return value === null || !Number.isFinite(value) ? "—" : `${Math.round(value)} min`;
}

function formatDecimal(value: number | null, unit = "") {
  return value === null || !Number.isFinite(value) ? "—" : `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}${unit}`;
}

function normalizedRatio(value: number | null | undefined, target: number | null | undefined) {
  if (!measured(value) || !measured(target) || target <= 0) return null;
  return Math.min(1, Math.max(0, value / target));
}

function normalizedPercent(value: number | null | undefined) {
  if (!measured(value)) return null;
  return Math.min(1, Math.max(0, value / 100));
}

function invertedRatio(value: number | null | undefined, reference: number | null | undefined) {
  if (!measured(value) || !measured(reference) || reference <= 0) return null;
  return Math.min(1, Math.max(0, 1 - value / reference));
}

function HeaderMetric({ label, value, average, tone = "neutral" }: { label: string; value: string; average: string; tone?: "positive" | "negative" | "neutral" }) {
  return <div className={`health-hero-stat ${styles.headerMetric} metric-tone--${tone}`}>
    <span>{label}</span>
    <strong className="metric-reading"><span>{value}</span></strong>
    <small className="health-hero-stat__average"><span>Moy. 30 j ·</span> <strong>{average}</strong></small>
  </div>;
}

export function SleepDetails({ data }: { data: HealthAnalytics }) {
  const latest = data.days.findLast(hasSleepMeasurement);
  const score = data.scores.findLast((item) => item.kind === "sleep" && item.score_date === latest?.metric_date)?.score ?? null;
  const averageScore = latest ? averageScoreLast30(data.scores, latest.metric_date) : null;
  const averageSleep = latest ? averageLast30Measured(data.days, "sleep_minutes", latest.metric_date) : null;
  const averageRegularity = latest ? averageLast30Measured(data.days, "sleep_regularity", latest.metric_date) : null;
  const averageEfficiency = latest ? averageLast30Measured(data.days, "sleep_efficiency", latest.metric_date) : null;
  const averageDebt = latest ? averageLast30Measured(data.days, "cumulative_sleep_debt_minutes", latest.metric_date) : null;
  const averageAwake = latest ? averageLast30Measured(data.days, "sleep_awake_minutes", latest.metric_date) : null;
  const regularity = latest?.sleep_regularity ?? null;
  const debt = latest?.cumulative_sleep_debt_minutes ?? null;
  const sleepTone = metricTone(latest?.sleep_minutes ?? null, averageSleep, "higher_is_better");
  const regularityTone = metricTone(regularity, averageRegularity, "higher_is_better");
  const debtTone = metricTone(debt, averageDebt, "lower_is_better");
  const bedtimeRecommendation = data.sleepRecommendation ?? (averageAwake === null
    ? null
    : recommendBedtimeFromAwake({ wakeTime: "07:00", sleepNeedMinutes: SLEEP_TARGET_MINUTES, averageAwakeMinutes: averageAwake }));
  const bedtimeRegularity = latest ? timingRegularity(data.days, "bedtime", data.timezone) : null;
  const wakeRegularity = latest ? timingRegularity(data.days, "wake_time", data.timezone) : null;
  const freshness = calculateSignalFreshness({ measuredAt: latestSourceMeasuredAt(latest), importedAt: data.importedAt, coverage: latest ? measuredCoverage([latest.sleep_minutes, latest.sleep_efficiency, latest.sleep_regularity]) : 0 });
  const recentScoreValues = data.days.slice(-5).map((day) => data.scores.findLast((item) => item.kind === "sleep" && item.score_date === day.metric_date)?.score ?? null);
  const radarDimensions: SleepRadarDimension[] = latest ? [
    { id: "duration", label: "Durée / besoin", normalizedValue: normalizedRatio(latest.sleep_minutes, latest.sleep_need_minutes), valueLabel: `${formatDurationMinutes(latest.sleep_minutes)} / ${formatDurationMinutes(latest.sleep_need_minutes)}` },
    { id: "efficiency", label: "Efficacité", normalizedValue: normalizedPercent(latest.sleep_efficiency), valueLabel: formatPercent(latest.sleep_efficiency) },
    { id: "regularity", label: "Régularité", normalizedValue: normalizedPercent(latest.sleep_regularity), valueLabel: formatPercent(latest.sleep_regularity) },
    { id: "continuity", label: "Continuité", normalizedValue: measured(latest.sleep_awake_percent) ? normalizedPercent(100 - latest.sleep_awake_percent) : null, valueLabel: measured(latest.sleep_awake_percent) ? `${Math.round(100 - latest.sleep_awake_percent)} % endormi` : "—" },
    { id: "debt", label: "Dette", normalizedValue: invertedRatio(latest.cumulative_sleep_debt_minutes, latest.sleep_need_minutes), valueLabel: formatDurationMinutes(latest.cumulative_sleep_debt_minutes) },
  ] : [];

  return <div className={`${styles.root} health-observatory-route`}><HealthPageShell kind="sleep" title="Sommeil" description="Durée, efficacité et régularité de votre sommeil." score={score} freshness={freshness} timezone={data.timezone} heroScore={<HealthHeroScore label="Score" value={score} unit="/100" average={averageScore} values={recentScoreValues} tone={metricTone(score, averageScore, "higher_is_better")} showBars={false} />} heroMetrics={latest ? <>
    <HeaderMetric label="Durée" value={formatDurationMinutes(latest.sleep_minutes)} average={formatDurationMinutes(averageSleep)} tone={sleepTone} />
    <HeaderMetric label="Efficacité" value={formatPercent(latest.sleep_efficiency)} average={formatPercent(averageEfficiency)} tone={metricTone(latest.sleep_efficiency, averageEfficiency, "higher_is_better")} />
    <HeaderMetric label="Régularité" value={formatPercent(regularity)} average={formatPercent(averageRegularity)} tone={regularityTone} />
  </> : undefined}>
    <main className={`${styles.redesign} health-observatory-content`}>
      {latest ? <>
        <section className={`${styles.overviewSection} health-observatory-panel`} aria-label="Synthèse du sommeil">
          <SleepRadar dimensions={radarDimensions} title="Profil du sommeil" summary="Objectif en périphérie" />
          <div className={styles.nextNight}>
            <h2>Prochaine nuit</h2>
            <dl className={styles.nextNightGrid}>
              <div><dt>Au lit vers</dt><dd>{formatClockMinutes(bedtimeRecommendation?.bedtimeMinutes ?? null)}</dd></div>
              <div><dt>Réveil</dt><dd>{formatClockMinutes(bedtimeRecommendation?.wakeTimeMinutes ?? null)}</dd></div>
              <div><dt>Sommeil visé</dt><dd>{formatDurationMinutes(bedtimeRecommendation?.sleepNeedMinutes ?? latest.sleep_need_minutes)}</dd></div>
              <div><dt>Temps éveillé · 30 j</dt><dd>{formatMinutesOnly(averageAwake)}</dd></div>
            </dl>
            {!bedtimeRecommendation && <p className={styles.unavailableNote}>Repère indisponible</p>}
          </div>
        </section>

        <section className={`${styles.lastNightSection} health-observatory-panel`} aria-labelledby="sleep-architecture-heading">
          <header className="health-observatory-panel-header"><h2 id="sleep-architecture-heading">Dernière nuit</h2><span>{clock(latest.bedtime, data.timezone)} → {clock(latest.wake_time, data.timezone)}</span></header>
          <div className={styles.architectureGrid}>
            <div className={`${styles.architecturePanel} health-observatory-subpanel`}><div className={styles.architectureHeader}><strong>Architecture</strong></div><div className={styles.architectureTimeline}><SleepStageTimeline stages={data.latestSleepStages} /></div></div>
            <div className={`${styles.distributionPanel} health-observatory-subpanel`}><div className={styles.architectureHeader}><strong>Phases</strong></div><SleepStageDistribution stages={[{ label: "Profond", value: latest.sleep_deep_percent, tone: "deep" }, { label: "REM", value: latest.sleep_rem_percent, tone: "rem" }, { label: "Léger", value: latest.sleep_light_percent, tone: "light" }, { label: "Éveillé", value: latest.sleep_awake_percent, tone: "awake" }]} /></div>
          </div>
          <dl className={styles.nightMetrics}>
            <div><dt>Latence</dt><dd>{formatMinutesOnly(latest.sleep_latency_minutes)}</dd></div>
            <div><dt>Éveillé</dt><dd>{formatMinutesOnly(latest.sleep_awake_minutes)}</dd></div>
            <div><dt>Fragmentation</dt><dd>{formatDecimal(latest.sleep_fragmentation, " /h")}</dd></div>
            <div><dt>Dette</dt><dd className={debtTone === "negative" ? styles.negative : undefined}>{formatDurationMinutes(debt)}</dd></div>
          </dl>
          <p className={styles.provenance}>Phases importées · score calculé par Soma · régularité coucher {bedtimeRegularity === null ? "—" : `±${Math.max(0, Math.round((100 - bedtimeRegularity) * 1.2))} min`} · réveil {wakeRegularity === null ? "—" : `±${Math.max(0, Math.round((100 - wakeRegularity) * 1.2))} min`}</p>
        </section>

        <section className={`${styles.trendsSection} health-observatory-panel`} aria-labelledby="sleep-trends-heading">
          <header className="health-observatory-panel-header"><h2 id="sleep-trends-heading">Tendances</h2><span>30 jours</span></header>
          <div className={styles.trendGrid}>
            <MetricTrendCard label="Durée" points={points(data.days, "sleep_minutes")} direction="higher_is_better" format={formatDurationMinutes} valueFormat="duration" compact animateCurrent animationFormat="duration" />
            <MetricTrendCard label="Efficacité" points={points(data.days, "sleep_efficiency")} unit="%" direction="higher_is_better" compact animateCurrent animationFormat="decimal" />
            <MetricTrendCard label="Régularité" points={points(data.days, "sleep_regularity")} unit="%" direction="higher_is_better" compact animateCurrent animationFormat="decimal" />
          </div>
          <details className={styles.secondaryTrends}>
            <summary>Autres mesures</summary>
            <div className={styles.secondaryTrendGrid}>
              <MetricTrendCard label="Fragmentation" points={points(data.days, "sleep_fragmentation")} unit="/h" direction="lower_is_better" compact animateCurrent animationFormat="decimal" />
              <MetricTrendCard label="Sommeil profond + paradoxal" points={restorativeSleepPoints(data.days)} direction="higher_is_better" format={formatDurationMinutes} valueFormat="duration" compact animateCurrent animationFormat="duration" />
              <MetricTrendCard label="Heure du coucher" points={bedtimePoints(data.days, data.timezone)} direction="context_only" format={formatClockMinutes} valueFormat="clock" compact />
            </div>
          </details>
        </section>
      </> : <section className={`${styles.empty} health-observatory-panel health-observatory-empty`} aria-labelledby="sleep-empty-heading"><MoonStar size={24} aria-hidden="true" /><div><h2 id="sleep-empty-heading">Aucune donnée de sommeil</h2><p>Aucune nuit mesurée sur la période.</p></div></section>}
    </main>
  </HealthPageShell></div>;
}

function timingRegularity(days: HealthMetricDay[], key: "bedtime" | "wake_time", timeZone: string) {
  const values = days.slice(-14).map((day) => clockMinutes(day[key], timeZone)).filter((value): value is number => value !== null);
  if (values.length < 3) return null;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const averageDeviation = values.reduce((sum, value) => sum + Math.abs(value - average), 0) / values.length;
  return Math.round(Math.max(0, 100 - (averageDeviation / 120) * 100));
}
