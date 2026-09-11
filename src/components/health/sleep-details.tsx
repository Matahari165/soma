import { MoonStar } from "lucide-react";

import { calculateSignalFreshness } from "@/domain/health/freshness";
import type { HealthAnalytics, HealthMetricDay } from "@/services/health-analytics";

import styles from "./sleep-redesign.module.css";
import { AnimatedMetricReading, AnimatedValueText } from "./animated-value";
import { HealthPageShell } from "./health-page-shell";
import { SleepStageDistribution, SleepStageTimeline } from "./health-charts";
import { averageLast30Measured, formatAverage, formatDurationMinutes, metricTone } from "./health-metric-utils";
import { MetricTrendCard } from "./metric-trend-card";

const duration = (minutes: number) => formatDurationMinutes(minutes);
const points = (days: HealthMetricDay[], key: keyof HealthMetricDay) => days.map((day) => ({ date: day.metric_date, value: typeof day[key] === "number" ? day[key] as number : null }));
const restorativeSleepPoints = (days: HealthMetricDay[]) => days.map((day) => ({ date: day.metric_date, value: day.sleep_rem_minutes === null && day.sleep_deep_minutes === null ? null : (day.sleep_rem_minutes ?? 0) + (day.sleep_deep_minutes ?? 0) }));

function clock(value: string | null, timeZone: string) {
  return value ? new Intl.DateTimeFormat("fr-FR", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "—";
}

function clockMinutes(value: string | null, timeZone: string) {
  if (!value) return null;
  const parts = new Intl.DateTimeFormat("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
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

function averageScoreLast30(scores: HealthAnalytics["scores"], kind: HealthAnalytics["scores"][number]["kind"], endDate: string | undefined) {
  if (!endDate) return null;
  const end = new Date(`${endDate}T12:00:00.000Z`);
  if (!Number.isFinite(end.getTime())) return null;
  end.setUTCDate(end.getUTCDate() - 29);
  const startDate = end.toISOString().slice(0, 10);
  const values = scores
    .filter((item) => item.kind === kind && item.score_date >= startDate && item.score_date <= endDate)
    .map((item) => item.score)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function formatClockMinutes(value: number | null) {
  if (value === null) return "—";
  const normalized = ((value % 1440) + 1440) % 1440;
  const date = new Date(Date.UTC(2000, 0, 1, Math.floor(normalized / 60), normalized % 60));
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", hour: "numeric", minute: "2-digit" }).format(date);
}

function toneClass(tone: "positive" | "negative" | "neutral") {
  if (tone === "positive") return styles.heroMetricPositive;
  if (tone === "negative") return styles.heroMetricNegative;
  return styles.heroMetricNeutral;
}

function HeaderScoreMetric({ label, value, average, values, tone }: { label: string; value: number | null; average: number | null; values: Array<number | null>; tone: "positive" | "negative" | "neutral" }) {
  const measured = values.filter((item): item is number => item !== null && Number.isFinite(item));
  const min = measured.length ? Math.min(...measured) : 0;
  const max = measured.length ? Math.max(...measured) : 1;
  return <div className={`${styles.headerScoreMetric} ${toneClass(tone)}`} role="group" aria-label={`${label} : ${value === null ? "indisponible" : `${Math.round(value)} %`}. Moyenne sur 30 jours : ${average === null ? "indisponible" : `${Math.round(average)} %`}.`}>
    <span>{label}</span><div className={styles.headerScoreBody}><div><strong>{value === null ? "—" : Math.round(value)}</strong><small>%</small><p>Moy. 30 j · {average === null ? "—" : Math.round(average)}</p></div><div className={styles.headerScoreBars} aria-hidden="true">{values.map((item, index) => <i key={`${label}-${index}`} style={{ height: item === null ? "20%" : `${max === min ? 58 : 28 + ((item - min) / (max - min)) * 52}%` }} />)}</div></div>
  </div>;
}

export function SleepDetails({ data }: { data: HealthAnalytics }) {
  const latest = data.days.findLast((day) => day.sleep_minutes !== null && day.sleep_minutes > 0);
  const score = data.scores.findLast((item) => item.kind === "sleep" && item.score_date === latest?.metric_date)?.score ?? null;
  const recommendation = data.sleepRecommendation;
  const target = recommendation?.sleepNeedMinutes ?? latest?.sleep_need_minutes ?? null;
  const debt = latest?.cumulative_sleep_debt_minutes ?? null;
  const averageSleep = latest ? averageLast30Measured(data.days, "sleep_minutes", latest.metric_date) : null;
  const averageEfficiency = latest ? averageLast30Measured(data.days, "sleep_efficiency", latest.metric_date) : null;
  const averageDebt = latest ? averageLast30Measured(data.days, "cumulative_sleep_debt_minutes", latest.metric_date) : null;
  const averageScore = latest ? averageScoreLast30(data.scores, "sleep", latest.metric_date) : null;
  const averageRegularity = latest ? averageLast30Measured(data.days, "sleep_regularity", latest.metric_date) : null;
  const regularity = latest?.sleep_regularity ?? null;
  const recentScoreValues = data.days.slice(-5).map((day) => data.scores.findLast((item) => item.kind === "sleep" && item.score_date === day.metric_date)?.score ?? null);
  const recentRegularityValues = data.days.slice(-5).map((day) => day.sleep_regularity);
  const scoreTone = metricTone(score, averageScore, "higher_is_better");
  const regularityTone = metricTone(regularity, averageRegularity, "higher_is_better");
  const sleepTone = metricTone(latest?.sleep_minutes ?? null, averageSleep, "higher_is_better");
  const efficiencyTone = metricTone(latest?.sleep_efficiency ?? null, averageEfficiency, "higher_is_better");
  const debtTone = metricTone(debt, averageDebt, "lower_is_better");
  const bedtimeRegularity = timingRegularity(data.days, "bedtime", data.timezone);
  const wakeRegularity = timingRegularity(data.days, "wake_time", data.timezone);
  const recommendedWakeMinutes = recommendation?.wakeTimeMinutes ?? clockMinutes(latest?.wake_time ?? null, data.timezone);
  const tonightBedtime = recommendation?.bedtimeMinutes ?? null;
  const freshness = calculateSignalFreshness({ measuredAt: latest?.source_freshness?.byType?.sleep ?? latest?.source_freshness?.latestMeasuredAt ?? latest?.metric_date, importedAt: data.importedAt, coverage: latest ? [latest.sleep_minutes, latest.sleep_regularity, score].filter((value) => value !== null).length / 3 : 0 });

  return <div className={styles.root}><HealthPageShell kind="sleep" title="Sommeil" description="Durée, qualité et régularité de votre sommeil." score={score} freshness={freshness} timezone={data.timezone} heroScore={<HeaderScoreMetric label="Score de sommeil" value={score} average={averageScore} values={recentScoreValues} tone={scoreTone} />} heroMetrics={<>
    <div className={`sleep-header-duration metric-tone--${sleepTone}`}><span>DURÉE DE SOMMEIL</span><strong>{latest ? formatDurationMinutes(latest.sleep_minutes) : "—"}<small>{target === null ? "" : ` / ${formatDurationMinutes(target)}`}</small></strong><em>Moy. 30 j · {formatDurationMinutes(averageSleep)}</em></div>
    <div className="health-hero-stat health-hero-stat--regularity"><HeaderScoreMetric label="Régularité du sommeil" value={regularity} average={averageRegularity} values={recentRegularityValues} tone={regularityTone} /></div>
    <div className={`health-hero-stat health-hero-stat--debt metric-tone--${debtTone}`}><span>Dette de sommeil</span><strong className={`metric-reading metric-reading--${debtTone}`}><span>{formatDurationMinutes(debt)}</span></strong></div>
  </>}>
    <div className={styles.redesign}>
      {latest ? <div className={styles.columns}>
        <div className={styles.column}>
          <section className={styles.panel} aria-labelledby="sleep-overview-heading">
            <header className={styles.panelHeader}><h2 id="sleep-overview-heading">Vue d’ensemble du sommeil</h2></header>
            <div className={styles.primarySignals} aria-label="Derniers signaux de sommeil">
              <div className={styles.todaySignal}><span>Efficacité</span><AnimatedMetricReading value={latest.sleep_efficiency} format="decimal" unit="%" className={`metric-reading--${efficiencyTone}`} /><small>Moyenne sur 30 jours · {formatAverage(averageEfficiency, "decimal", 0)} %</small></div>
              <div className={styles.todaySignal}><span>Éveillé</span><AnimatedMetricReading value={latest.sleep_awake_minutes} format="number" unit="min" decimals={0} /><small>Dernière nuit complète</small></div>
            </div>
          </section>

          <section className={styles.panel} aria-labelledby="sleep-timing-heading">
            <header className={styles.panelHeader}><h2 id="sleep-timing-heading">Horaires et régularité</h2><span className={styles.eyebrow}>14 DERNIERS JOURS</span></header>
            <div className={styles.timingRows}>
              <div className={styles.timingRow}><span>Coucher</span><strong>{clock(latest.bedtime, data.timezone)}</strong><small>{bedtimeRegularity === null ? "Régularité en attente" : <>fenêtre habituelle · ±{Math.max(0, Math.round((100 - bedtimeRegularity) * 1.2))} min</>}</small></div>
              <div className={styles.timingRow}><span>Réveil</span><strong>{clock(latest.wake_time, data.timezone)}</strong><small>{wakeRegularity === null ? "Régularité en attente" : <>fenêtre habituelle · ±{Math.max(0, Math.round((100 - wakeRegularity) * 1.2))} min</>}</small></div>
              <div className={styles.timingRow}><span>Régularité globale</span><strong><AnimatedValueText value={latest.sleep_regularity} suffix="%" decimals={0} /></strong><small>{latest.sleep_regularity === null ? "Cohérence en attente" : "cohérence · en amélioration"}</small></div>
            </div>
          </section>

          <section className={styles.panel} aria-labelledby="sleep-tonight-heading"><div className={styles.recommendation}>
            <span className={styles.recommendationEyebrow}>CE SOIR</span><h2 id="sleep-tonight-heading">{tonightBedtime === null ? "Gardez votre fenêtre habituelle" : "Protégez la fenêtre établie"}</h2><strong>{target === null ? "Objectif indisponible" : `${formatDurationMinutes(target)} nécessaires`}</strong><p>{tonightBedtime === null || target === null ? "Un objectif de sommeil complet est nécessaire pour formuler une recommandation." : `Ralentissez dès ${formatClockMinutes(tonightBedtime - 30)} · éteignez vers ${formatClockMinutes(tonightBedtime)}${recommendedWakeMinutes === null ? "" : ` pour un réveil à ${formatClockMinutes(recommendedWakeMinutes)}`}`}</p>
          </div></section>

        </div>

        <div className={styles.column}>
          <section className={styles.panel} aria-labelledby="sleep-trends-heading">
            <header className={styles.panelHeader}><h2 id="sleep-trends-heading">Tendances du sommeil</h2><span className={styles.eyebrow}>30 JOURS · SIX SIGNAUX</span></header>
            <div className={styles.trendGrid}>
              <MetricTrendCard label="Sommeil total" points={points(data.days, "sleep_minutes")} direction="higher_is_better" format={duration} target={target} animateCurrent animationFormat="duration" />
              <MetricTrendCard label="Efficacité" points={points(data.days, "sleep_efficiency")} unit="%" direction="higher_is_better" animateCurrent animationFormat="decimal" />
              <MetricTrendCard label="Dette de sommeil" points={points(data.days, "cumulative_sleep_debt_minutes")} direction="lower_is_better" format={duration} animateCurrent animationFormat="duration" />
              <MetricTrendCard label="Fragmentation" points={points(data.days, "sleep_fragmentation")} unit="/h" direction="lower_is_better" animateCurrent animationFormat="decimal" />
              <MetricTrendCard label="Régularité" points={points(data.days, "sleep_regularity")} unit="%" direction="higher_is_better" animateCurrent animationFormat="decimal" />
              <MetricTrendCard label="REM + sommeil profond" points={restorativeSleepPoints(data.days)} direction="higher_is_better" format={duration} animateCurrent animationFormat="duration" />
            </div>
          </section>

          <section className={styles.panel} aria-labelledby="sleep-architecture-heading">
            <header className={styles.panelHeader}><h2 id="sleep-architecture-heading">Dernière nuit</h2></header>
            <div className={styles.architecturePanel}><div className={styles.architectureHeader}><strong>Architecture du sommeil</strong><span>{clock(latest.bedtime, data.timezone)} → {clock(latest.wake_time, data.timezone)}</span></div><div className={styles.architectureTimeline}><SleepStageTimeline stages={data.latestSleepStages} /></div></div>
            <div className={styles.distributionPanel}><div className={styles.architectureHeader}><strong>Répartition des phases</strong><span>Dernière nuit complète</span></div><SleepStageDistribution stages={[{ label: "Profond", value: latest.sleep_deep_percent, tone: "deep" }, { label: "REM", value: latest.sleep_rem_percent, tone: "rem" }, { label: "Léger", value: latest.sleep_light_percent, tone: "light" }, { label: "Éveillé", value: latest.sleep_awake_percent, tone: "awake" }]} /><span className={styles.signalPositive}>Mesuré · phases importées, scores calculés par Soma</span></div>
          </section>
        </div>
      </div> : <section className={`${styles.panel} ${styles.empty}`}><MoonStar size={24} aria-hidden="true" /><div><span className={styles.eyebrow}>AUCUNE DONNÉE</span><h2>Aucune donnée de sommeil</h2><p>Synchronisez une nuit complète pour commencer.</p></div></section>}
    </div>
  </HealthPageShell></div>;
}
