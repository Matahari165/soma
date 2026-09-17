import { MoonStar } from "lucide-react";

import { calculateSignalFreshness } from "@/domain/health/freshness";
import { calculateSleepScore, SLEEP_SCORE_ALGORITHM_VERSION } from "@/domain/scores/sleep";
import { recommendBedtimeFromAwake } from "@/domain/scores/sleep-need";
import type { HealthAnalytics, HealthMetricDay } from "@/services/health-analytics";

import styles from "./sleep-redesign.module.css";
import { HealthPageShell } from "./health-page-shell";
import { SleepStageDistribution } from "./health-charts";
import { averageLast30Measured, formatDurationMinutes, latestSourceMeasuredAt, measuredCoverage, metricTone } from "./health-metric-utils";
import { MetricTrendCard } from "./metric-trend-card";
import { SleepScoreOverview, type SleepScoreBreakdown, type SleepScoreComponent } from "./sleep-score-overview";
import type { SleepRadarDimension } from "./sleep-radar";

const SLEEP_TARGET_MINUTES = 8 * 60 + 30;

type RadarComparison = "up" | "down" | "equal" | null;
type SleepRadarDisplayDimension = SleepRadarDimension & {
  comparison?: RadarComparison;
  comparisonLabel?: string;
};

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
  return value ? new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "—";
}

/** The previous night is kept adjacent to the following metric date. */
function clockMinutes(value: string | null, timeZone: string) {
  if (!value) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const minutes = Number(parts.find((part) => part.type === "hour")?.value ?? 0) * 60 + Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return minutes < 12 * 60 ? minutes + 1440 : minutes;
}

function formatClockMinutes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const normalized = ((value % 1440) + 1440) % 1440;
  return `${Math.floor(normalized / 60)}:${String(Math.round(normalized % 60)).padStart(2, "0")}`;
}

function averageScoreLast30(scores: HealthAnalytics["scores"], endDate: string | undefined, algorithmVersion: string | null | undefined) {
  if (!endDate || !algorithmVersion) return null;
  const end = new Date(`${endDate}T12:00:00.000Z`);
  if (!Number.isFinite(end.getTime())) return null;
  end.setUTCDate(end.getUTCDate() - 29);
  const startDate = end.toISOString().slice(0, 10);
  const values = scores
    .filter((item) => item.kind === "sleep" && item.algorithm_version === algorithmVersion && item.score_date >= startDate && item.score_date <= endDate)
    .map((item) => item.score)
    .filter(measured);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function formatPercent(value: number | null) {
  return value === null || !Number.isFinite(value) ? "—" : `${Math.round(value)}%`;
}

function formatMinutesOnly(value: number | null) {
  return value === null || !Number.isFinite(value) ? "—" : `${Math.round(value)} min`;
}

function normalizedRatio(value: number | null | undefined, target: number | null | undefined) {
  if (!measured(value) || !measured(target) || target <= 0) return null;
  return Math.min(1, Math.max(0, value / target));
}

function normalizedPercent(value: number | null | undefined) {
  if (!measured(value)) return null;
  return Math.min(1, Math.max(0, value / 100));
}

function invertedObservedRatio(value: number | null | undefined, values: Array<number | null>) {
  if (!measured(value)) return null;
  const measuredValues = values.filter(measured);
  if (!measuredValues.length) return null;
  const observedMaximum = Math.max(...measuredValues);
  if (observedMaximum <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - value / observedMaximum));
}

function comparison(value: number | null | undefined, average: number | null | undefined): RadarComparison {
  if (!measured(value) || !measured(average)) return null;
  if (value === average) return "equal";
  return value > average ? "up" : "down";
}

function comparisonLabel(value: number | null, format: (value: number | null) => string) {
  return measured(value) ? `30-day avg · ${format(value)}` : undefined;
}

function averageValueLabel(value: number | null, format: (value: number | null) => string) {
  return measured(value) ? format(value) : undefined;
}

function normalizedDriver(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) return null;
  return value;
}

function sleepScoreBreakdown(latest: HealthMetricDay | undefined, scoreEntry: HealthAnalytics["scores"][number] | undefined): SleepScoreBreakdown | null {
  if (!latest || !scoreEntry || !measured(scoreEntry.score) || scoreEntry.algorithm_version !== SLEEP_SCORE_ALGORITHM_VERSION) return null;
  if (!measured(latest.sleep_minutes) || !measured(latest.sleep_need_minutes) || latest.sleep_need_minutes <= 0 || !measured(latest.sleep_efficiency) || !measured(latest.sleep_regularity)) return null;

  const driverDuration = normalizedDriver(scoreEntry.drivers?.duration);
  const driverEfficiency = normalizedDriver(scoreEntry.drivers?.efficiency);
  const driverRegularity = normalizedDriver(scoreEntry.drivers?.regularity);
  const driversAvailable = driverDuration !== null && driverEfficiency !== null && driverRegularity !== null;
  const exactEngine = calculateSleepScore({
    actualSleepMinutes: latest.sleep_minutes,
    estimatedNeedMinutes: latest.sleep_need_minutes,
    efficiencyPercent: latest.sleep_efficiency,
    regularityPercent: latest.sleep_regularity,
  });
  if (driversAvailable && (
    Math.abs(driverDuration - exactEngine.durationComponent) > 0.000001
    || Math.abs(driverEfficiency - exactEngine.efficiencyComponent) > 0.000001
    || Math.abs(driverRegularity - exactEngine.regularityComponent) > 0.000001
  )) return null;
  if (driversAvailable && Math.round(100 * (0.7 * driverDuration + 0.1 * driverEfficiency + 0.2 * driverRegularity)) !== exactEngine.score) return null;

  // A persisted score is authoritative. If it cannot be reproduced from the
  // stored drivers or the exact engine inputs, do not display a made-up split.
  if (exactEngine.score !== Math.round(scoreEntry.score)) return null;

  const components: SleepScoreComponent[] = [
    { id: "duration" as const, label: "Duration", weight: 70, sourceValueLabel: `${formatDurationMinutes(latest.sleep_minutes)} · need ${formatDurationMinutes(latest.sleep_need_minutes)}`, formula: "duration ÷ estimated need", normalization: "clamp(0, 1, duration ÷ need)", normalizedValue: exactEngine.durationComponent },
    { id: "efficiency" as const, label: "Efficiency", weight: 10, sourceValueLabel: formatPercent(latest.sleep_efficiency), formula: "source efficiency ÷ 100", normalization: "clamp(0, 1, value ÷ 100)", normalizedValue: exactEngine.efficiencyComponent },
    { id: "regularity" as const, label: "Regularity", weight: 20, sourceValueLabel: formatPercent(latest.sleep_regularity), formula: "source regularity ÷ 100", normalization: "clamp(0, 1, value ÷ 100)", normalizedValue: exactEngine.regularityComponent },
  ].map((component) => ({ ...component, contribution: component.normalizedValue * component.weight }));

  return { score: Math.round(scoreEntry.score), algorithmVersion: scoreEntry.algorithm_version, components };
}

export function SleepDetails({ data }: { data: HealthAnalytics }) {
  const latest = data.days.findLast(hasSleepMeasurement);
  const scoreEntry = data.scores.findLast((item) => item.kind === "sleep" && item.score_date === latest?.metric_date);
  const score = scoreEntry?.score ?? null;
  const scoreBreakdown = sleepScoreBreakdown(latest, scoreEntry);
  const scoreComponent = (id: SleepScoreComponent["id"]) => scoreBreakdown?.components.find((component) => component.id === id);
  const averageScore = latest ? averageScoreLast30(data.scores, latest.metric_date, scoreEntry?.algorithm_version) : null;
  const averageSleep = latest ? averageLast30Measured(data.days, "sleep_minutes", latest.metric_date) : null;
  const averageRegularity = latest ? averageLast30Measured(data.days, "sleep_regularity", latest.metric_date) : null;
  const averageEfficiency = latest ? averageLast30Measured(data.days, "sleep_efficiency", latest.metric_date) : null;
  const averageLatency = latest ? averageLast30Measured(data.days, "sleep_latency_minutes", latest.metric_date) : null;
  const averageDebt = latest ? averageLast30Measured(data.days, "cumulative_sleep_debt_minutes", latest.metric_date) : null;
  const averageAwake = latest ? averageLast30Measured(data.days, "sleep_awake_minutes", latest.metric_date) : null;
  const recentDays = data.days.slice(-30);
  const bedtimeRecommendation = data.sleepRecommendation ?? (averageAwake === null
    ? null
    : recommendBedtimeFromAwake({ wakeTime: "07:00", sleepNeedMinutes: SLEEP_TARGET_MINUTES, averageAwakeMinutes: averageAwake }));
  const freshness = calculateSignalFreshness({ measuredAt: latestSourceMeasuredAt(latest), importedAt: data.importedAt, coverage: latest ? measuredCoverage([latest.sleep_minutes, latest.sleep_efficiency, latest.sleep_regularity]) : 0 });
  const radarDimensions: SleepRadarDisplayDimension[] = latest ? [
    {
      id: "duration",
      label: "Duration",
      normalizedValue: normalizedRatio(latest.sleep_minutes, latest.sleep_need_minutes),
      valueLabel: formatDurationMinutes(latest.sleep_minutes),
      averageLabel: averageValueLabel(averageSleep, formatDurationMinutes),
      definition: "Measured sleep duration compared to estimated need for this night.",
      readingDirection: "Closer to estimated need = better",
      scoreRole: "Sleep score component · 70%",
      scoreWeight: 70,
      scoreFormula: "duration ÷ estimated need",
      scoreNormalization: "clamp(0, 1, duration ÷ need)",
      scoreContribution: scoreComponent("duration")?.contribution ?? null,
      comparison: comparison(latest.sleep_minutes, averageSleep),
      comparisonLabel: comparisonLabel(averageSleep, formatDurationMinutes),
      comparisonTone: metricTone(latest.sleep_minutes, averageSleep, "higher_is_better"),
      sourceLabel: "Google Health",
    },
    {
      id: "efficiency",
      label: "Efficiency",
      normalizedValue: normalizedPercent(latest.sleep_efficiency),
      valueLabel: formatPercent(latest.sleep_efficiency),
      averageLabel: averageValueLabel(averageEfficiency, formatPercent),
      definition: "Proportion of time in bed spent asleep, provided by health source.",
      readingDirection: "Higher = better",
      scoreRole: "Sleep score component · 10%",
      scoreWeight: 10,
      scoreFormula: "source efficiency ÷ 100",
      scoreNormalization: "clamp(0, 1, value ÷ 100)",
      scoreContribution: scoreComponent("efficiency")?.contribution ?? null,
      comparison: comparison(latest.sleep_efficiency, averageEfficiency),
      comparisonLabel: comparisonLabel(averageEfficiency, formatPercent),
      comparisonTone: metricTone(latest.sleep_efficiency, averageEfficiency, "higher_is_better"),
      sourceLabel: "Google Health",
    },
    {
      id: "regularity",
      label: "Regularity",
      normalizedValue: normalizedPercent(latest.sleep_regularity),
      valueLabel: formatPercent(latest.sleep_regularity),
      averageLabel: averageValueLabel(averageRegularity, formatPercent),
      definition: "Consistency of sleep schedule relative to observed rhythm.",
      readingDirection: "Higher = better",
      scoreRole: "Sleep score component · 20%",
      scoreWeight: 20,
      scoreFormula: "source regularity ÷ 100",
      scoreNormalization: "clamp(0, 1, value ÷ 100)",
      scoreContribution: scoreComponent("regularity")?.contribution ?? null,
      comparison: comparison(latest.sleep_regularity, averageRegularity),
      comparisonLabel: comparisonLabel(averageRegularity, formatPercent),
      comparisonTone: metricTone(latest.sleep_regularity, averageRegularity, "higher_is_better"),
      sourceLabel: "Google Health",
    },
    {
      id: "latency",
      label: "Latency",
      normalizedValue: invertedObservedRatio(latest.sleep_latency_minutes, recentDays.map((day) => day.sleep_latency_minutes)),
      valueLabel: formatMinutesOnly(latest.sleep_latency_minutes),
      averageLabel: averageValueLabel(averageLatency, formatMinutesOnly),
      definition: "Observed time between going to bed and falling asleep.",
      readingDirection: "Shorter = better",
      scoreRole: "Context metric · excluded from Sleep score",
      comparison: comparison(latest.sleep_latency_minutes, averageLatency),
      comparisonLabel: comparisonLabel(averageLatency, formatMinutesOnly),
      comparisonTone: metricTone(latest.sleep_latency_minutes, averageLatency, "lower_is_better"),
      sourceLabel: "Google Health",
    },
    {
      id: "debt",
      label: "Debt",
      normalizedValue: invertedObservedRatio(latest.cumulative_sleep_debt_minutes, recentDays.map((day) => day.cumulative_sleep_debt_minutes)),
      valueLabel: formatDurationMinutes(latest.cumulative_sleep_debt_minutes),
      averageLabel: averageValueLabel(averageDebt, formatDurationMinutes),
      definition: "Cumulative missed sleep relative to estimated needs.",
      readingDirection: "Lower = better",
      scoreRole: "Context metric · excluded from Sleep score",
      comparison: comparison(latest.cumulative_sleep_debt_minutes, averageDebt),
      comparisonLabel: comparisonLabel(averageDebt, formatDurationMinutes),
      comparisonTone: metricTone(latest.cumulative_sleep_debt_minutes, averageDebt, "lower_is_better"),
      sourceLabel: "Soma",
    },
  ] : [];

  return <div className={`${styles.root} health-observatory-route`}><HealthPageShell kind="sleep" title="Sleep" description="Duration, efficiency, and regularity of your sleep." score={score} freshness={freshness} timezone={data.timezone} showHeroScore={false} showFreshness={true}>
    <section className={`${styles.redesign} health-observatory-content`} aria-label="Sleep content">
      {latest ? <>
        <section className={`${styles.overviewSection} health-observatory-panel`} aria-label="Sleep summary">
          <SleepScoreOverview
            dimensions={radarDimensions}
            score={score}
            average={averageScore}
            breakdown={scoreBreakdown}
            scoreSupplement={{
              title: "Next night",
              rows: [
                { label: "Target bedtime", value: formatClockMinutes(bedtimeRecommendation?.bedtimeMinutes ?? null) },
                { label: "Wake-up", value: formatClockMinutes(bedtimeRecommendation?.wakeTimeMinutes ?? null) },
                { label: "Target sleep", value: formatDurationMinutes(bedtimeRecommendation?.sleepNeedMinutes ?? latest.sleep_need_minutes) },
                { label: "Awake time · 30d", value: formatMinutesOnly(averageAwake) },
              ],
              note: !bedtimeRecommendation ? "Benchmark unavailable" : undefined,
            }}
          />
        </section>

        <section className={`${styles.trendsSection} health-observatory-panel`} aria-labelledby="sleep-trends-heading">
          <header className="health-observatory-panel-header"><h2 id="sleep-trends-heading">Trends</h2><span>30 days</span></header>
          <div className={styles.trendGrid}>
            <MetricTrendCard label="Duration" points={points(data.days, "sleep_minutes")} direction="higher_is_better" format={formatDurationMinutes} valueFormat="duration" compact animateCurrent animationFormat="duration" />
            <MetricTrendCard label="Efficiency" points={points(data.days, "sleep_efficiency")} unit="%" direction="higher_is_better" compact animateCurrent animationFormat="decimal" />
            <MetricTrendCard label="Regularity" points={points(data.days, "sleep_regularity")} unit="%" direction="higher_is_better" compact animateCurrent animationFormat="decimal" />
          </div>
          <div className={styles.secondaryTrendGrid}>
            <MetricTrendCard label="Fragmentation" points={points(data.days, "sleep_fragmentation")} unit="/h" direction="lower_is_better" compact animateCurrent animationFormat="decimal" />
            <MetricTrendCard label="Deep + REM sleep" points={restorativeSleepPoints(data.days)} direction="higher_is_better" format={formatDurationMinutes} valueFormat="duration" compact animateCurrent animationFormat="duration" />
            <MetricTrendCard label="Bedtime" points={bedtimePoints(data.days, data.timezone)} direction="context_only" format={formatClockMinutes} valueFormat="clock" compact />
          </div>
        </section>
        <section className={`${styles.lastNightSection} health-observatory-panel`} aria-labelledby="sleep-stages-heading">
          <header className="health-observatory-panel-header"><h2 id="sleep-stages-heading">Stage distribution</h2><span>{clock(latest.bedtime, data.timezone)} → {clock(latest.wake_time, data.timezone)}</span></header>
          <div className={styles.distributionPanel}><SleepStageDistribution stages={[{ label: "Deep", value: latest.sleep_deep_percent, tone: "deep" }, { label: "REM", value: latest.sleep_rem_percent, tone: "rem" }, { label: "Light", value: latest.sleep_light_percent, tone: "light" }, { label: "Awake", value: latest.sleep_awake_percent, tone: "awake" }]} /></div>
        </section>
      </> : <section className={`${styles.empty} health-observatory-panel health-observatory-empty`} aria-labelledby="sleep-empty-heading"><MoonStar size={24} aria-hidden="true" /><div><h2 id="sleep-empty-heading">No sleep data</h2><p>0 measured nights over the last 30 days. Import your sleep from Google Health, then return here.</p><p><a href="/settings">Check Google Health connection</a></p></div></section>}
    </section>
  </HealthPageShell></div>;
}
