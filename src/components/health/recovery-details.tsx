import { calculateSignalFreshness } from "@/domain/health/freshness";
import type { HealthAnalytics, HealthMetricDay, HeartRateSample, ScoreDay } from "@/services/health-analytics";

import { LineTrendChart } from "./health-charts";
import { averageLast30Measured, formatAverage, latestSourceMeasuredAt, measuredCoverage, metricTone } from "./health-metric-utils";
import { HealthHeroScore, HealthPageShell } from "./health-page-shell";
import { MetricReading } from "./metric-reading";
import { MetricTrendCard } from "./metric-trend-card";
import { RecoveryScorePopover } from "./recovery-score-popover";
import styles from "./recovery-redesign.module.css";

type TrendKind = "hrv_daily" | "hrv_nightly" | "resting_heart_rate" | "respiratory_rate";
type ZoneKey = "light_zone_minutes" | "moderate_zone_minutes" | "vigorous_zone_minutes" | "peak_zone_minutes";

const trendLabels: Record<TrendKind, { label: string; unit: string; direction: "higher" | "lower" | "context" }> = {
  hrv_daily: { label: "Variabilité cardiaque", unit: "ms", direction: "higher" },
  hrv_nightly: { label: "VFC nocturne", unit: "ms", direction: "higher" },
  resting_heart_rate: { label: "FC au repos", unit: "bpm", direction: "lower" },
  respiratory_rate: { label: "Fréquence respiratoire", unit: "rpm", direction: "context" },
};

const metricKeys: Record<TrendKind, keyof HealthMetricDay> = {
  hrv_daily: "hrv_ms",
  hrv_nightly: "hrv_ms",
  resting_heart_rate: "resting_heart_rate",
  respiratory_rate: "respiratory_rate",
};

const zoneDefinitions: Array<{ key: ZoneKey; label: string; tone: string }> = [
  { key: "light_zone_minutes", label: "Légère", tone: "light" },
  { key: "moderate_zone_minutes", label: "Modérée", tone: "moderate" },
  { key: "vigorous_zone_minutes", label: "Vigoureuse", tone: "vigorous" },
  { key: "peak_zone_minutes", label: "Pic", tone: "peak" },
];

const directionMap: Record<string, "higher_is_better" | "lower_is_better" | "context_only"> = {
  higher: "higher_is_better",
  lower: "lower_is_better",
  context: "context_only",
};

const visibleTrendKeys: TrendKind[] = ["hrv_daily", "hrv_nightly", "resting_heart_rate", "respiratory_rate"];

function points(days: HealthMetricDay[], key: TrendKind) {
  return days.map((day) => {
    const value = day[metricKeys[key]];
    return { date: day.metric_date, value: typeof value === "number" && Number.isFinite(value) ? value : null };
  });
}

function formatValue(value: number | null, decimals = 0) {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(decimals).replace(/\.0+$/, "");
}

function scoreDriver(drivers: Record<string, unknown> | undefined, key: string) {
  const value = drivers?.[key];
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function averageLast30Scores(scores: ScoreDay[], kind: ScoreDay["kind"], endDate: string | undefined) {
  const latestDate = endDate ?? scores.filter((item) => item.kind === kind).map((item) => item.score_date).sort().at(-1);
  if (!latestDate) return null;
  const start = new Date(`${latestDate}T12:00:00.000Z`);
  if (!Number.isFinite(start.getTime())) return null;
  start.setUTCDate(start.getUTCDate() - 29);
  const startDate = start.toISOString().slice(0, 10);
  const values = scores
    .filter((item) => item.kind === kind && item.score_date >= startDate && item.score_date <= latestDate && typeof item.score === "number" && Number.isFinite(item.score))
    .map((item) => item.score as number);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function hasRecoveryMeasurement(day: HealthMetricDay) {
  return [
    day.sleep_minutes,
    day.hrv_ms,
    day.resting_heart_rate,
    day.respiratory_rate,
    day.oxygen_saturation,
    day.oxygen_saturation_lower,
    day.oxygen_saturation_upper,
    day.skin_temperature_delta,
    day.nightly_temperature_celsius,
    day.baseline_temperature_celsius,
    day.light_zone_minutes,
    day.moderate_zone_minutes,
    day.vigorous_zone_minutes,
    day.peak_zone_minutes,
    day.vo2_max,
    day.core_body_temperature_celsius,
  ].some((value) => typeof value === "number" && Number.isFinite(value));
}

function civilDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
}

function formatCivilDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(civilDate(value)).replace(".", "");
}

/** Averages each zone over measured days in the local Monday–Sunday week. */
export function averageWeeklyZoneMinutes(days: HealthMetricDay[], endDate?: string) {
  const latestDate = endDate ?? [...days].map((day) => day.metric_date).sort().at(-1);
  if (!latestDate || !Number.isFinite(civilDate(latestDate).getTime())) {
    return { startDate: null, endDate: null, zones: zoneDefinitions.map((zone) => ({ ...zone, minutes: null, measuredDays: 0 })) };
  }
  const latest = civilDate(latestDate);
  const weekday = latest.getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const start = new Date(latest);
  start.setUTCDate(start.getUTCDate() + mondayOffset);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const startDate = start.toISOString().slice(0, 10);
  const weekEndDate = end.toISOString().slice(0, 10);
  const weekDays = days.filter((day) => day.metric_date >= startDate && day.metric_date <= weekEndDate);
  return {
    startDate,
    endDate: weekEndDate,
    zones: zoneDefinitions.map((zone) => {
      const values = weekDays
        .map((day) => day[zone.key])
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      return { ...zone, minutes: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null, measuredDays: values.length };
    }),
  };
}

function localTime(value: string, timezone: string) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat("fr-FR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(parsed) : "—";
}

function HeartRateTrendCard({ samples, timezone }: { samples: HeartRateSample[]; timezone: string }) {
  const ordered = samples
    .filter((sample) => typeof sample.bpm === "number" && Number.isFinite(sample.bpm) && Number.isFinite(Date.parse(sample.measuredAt)))
    .sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt));
  const values = ordered.map((sample) => sample.bpm);
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const current = values.at(-1) ?? null;
  const first = ordered.at(0);
  const last = ordered.at(-1);
  const description = `Fréquence cardiaque. ${values.length ? `${values.length} échantillons disponibles, de ${localTime(first?.measuredAt ?? "", timezone)} à ${localTime(last?.measuredAt ?? "", timezone)}.` : "Aucun échantillon disponible."}`;
  return <article className={`metric-trend-card ${styles.sampleTrendCard}`} aria-label={description}>
    <header><div><span>Fréquence cardiaque</span><MetricReading value={formatValue(current)} unit={current === null ? undefined : "bpm"} /></div><small className="metric-trend-card__average">avg {average === null ? "—" : `${formatAverage(average, "decimal")} bpm`}</small></header>
    <div className="chart-frame"><LineTrendChart points={ordered.map((sample) => ({ date: sample.measuredAt, value: sample.bpm }))} label="Fréquence cardiaque" unit="bpm" /></div>
    <div className="chart-axis" aria-hidden="true"><span>{first ? localTime(first.measuredAt, timezone) : "—"}</span><span>{last ? `${localTime(last.measuredAt, timezone)} · ${values.length} mesures` : "—"}</span></div>
  </article>;
}

function WeeklyZoneChart({ summary }: { summary: ReturnType<typeof averageWeeklyZoneMinutes> }) {
  const measuredZones = summary.zones.filter((zone) => typeof zone.minutes === "number" && Number.isFinite(zone.minutes));
  const total = measuredZones.reduce((sum, zone) => sum + Math.max(0, zone.minutes ?? 0), 0);
  const valueText = (minutes: number | null) => minutes === null || !Number.isFinite(minutes) ? "—" : `${Math.round(minutes)} min/j`;
  const description = `Moyenne quotidienne des zones cardiaques, semaine du ${summary.startDate ? formatCivilDate(summary.startDate) : "—"} au ${summary.endDate ? formatCivilDate(summary.endDate) : "—"} : ${summary.zones.map((zone) => `${zone.label} ${valueText(zone.minutes)}, ${zone.measuredDays} jour${zone.measuredDays > 1 ? "s" : ""} mesuré${zone.measuredDays > 1 ? "s" : ""}`).join(" ; ")}.`;
  return <div className={styles.weeklyZones}>
    <div className={styles.zoneBar} role="img" aria-label={description}>
      {measuredZones.filter((zone) => (zone.minutes ?? 0) > 0).map((zone) => <span key={zone.label} className={`${styles.zoneSegment} ${styles[`zoneSegment--${zone.tone}`]}`} style={{ width: `${total ? ((zone.minutes ?? 0) / total) * 100 : 0}%` }} />)}
    </div>
    <p className="sr-only">{description}</p>
    <ul className={styles.zoneLegend}>{summary.zones.map((zone) => <li key={zone.label}><span className={`${styles.zoneDot} ${styles[`zoneDot--${zone.tone}`]}`} /> <span>{zone.label}</span><strong>{valueText(zone.minutes)}</strong></li>)}</ul>
  </div>;
}

export function RecoveryDetails({ data }: { data: HealthAnalytics }) {
  const latest = data.days.findLast(hasRecoveryMeasurement);
  const recoveryScore = data.scores.findLast((item) => item.kind === "recovery" && item.score_date === latest?.metric_date);
  const score = recoveryScore?.score ?? null;
  const averages = {
    hrv: latest ? averageLast30Measured(data.days, "hrv_ms", latest.metric_date) : null,
    restingHeartRate: latest ? averageLast30Measured(data.days, "resting_heart_rate", latest.metric_date) : null,
    respiratoryRate: latest ? averageLast30Measured(data.days, "respiratory_rate", latest.metric_date) : null,
    recovery: averageLast30Scores(data.scores, "recovery", latest?.metric_date),
  };
  const drivers = recoveryScore?.drivers;
  const driverCoverage = Number(drivers?.coverage);
  const coverage = Number.isFinite(driverCoverage)
    ? Math.min(1, Math.max(0, driverCoverage))
    : latest ? measuredCoverage([latest.hrv_ms, latest.resting_heart_rate, latest.sleep_minutes]) : 0;
  const freshness = calculateSignalFreshness({ measuredAt: latestSourceMeasuredAt(latest), importedAt: data.importedAt, coverage });
  const recentScoreValues = data.days.slice(-5).map((day) => data.scores.findLast((item) => item.kind === "recovery" && item.score_date === day.metric_date)?.score ?? null);
  const heroScoreTone = metricTone(score, averages.recovery, "higher_is_better");
  const weeklyZones = averageWeeklyZoneMinutes(data.days, latest?.metric_date);
  const heroMetrics = latest ? <div className={`${styles.headerMetric} health-hero-stat metric-tone--${metricTone(latest.resting_heart_rate ?? null, averages.restingHeartRate, "lower_is_better")}`}>
    <span>FC au repos</span>
    <MetricReading value={formatValue(latest.resting_heart_rate)} unit={latest.resting_heart_rate === null ? undefined : "bpm"} />
    <small className="health-hero-stat__average">Moy. 30 j · {formatAverage(averages.restingHeartRate, "decimal")} bpm</small>
  </div> : undefined;

  return <div className={styles.page}>
    <HealthPageShell
      kind="recovery"
      title="Récupération"
      description="Score de récupération, signaux cardiaques et respiratoires."
      score={score}
      freshness={freshness}
      timezone={data.timezone}
      heroScore={<HealthHeroScore label="Score de récupération" value={score} average={averages.recovery} values={recentScoreValues} tone={heroScoreTone} action={latest ? <RecoveryScorePopover score={score} hrv={scoreDriver(drivers, "hrv")} restingHeartRate={scoreDriver(drivers, "restingHeartRate")} sleep={scoreDriver(drivers, "sleep")} /> : undefined} showBars={false} />}
      heroMetrics={heroMetrics}
    >
      {latest ? <main className={`${styles.content} health-observatory-content`}>
        <section className={`${styles.panel} ${styles.factorsPanel} health-observatory-panel`} aria-labelledby="recovery-drivers-heading">
          <div className="health-observatory-panel-header"><h2 id="recovery-drivers-heading">Facteurs du score</h2><span className={styles.filters}>{Number.isFinite(driverCoverage) ? `${Math.round(driverCoverage * 100)} % couverts` : `${Math.round(coverage * 100)} % couverts`}</span></div>
          <p className={`${styles.calculatedBy} health-observatory-note`}>Calcul Soma · pondération : VFC 40 %, FC au repos 30 %, sommeil 30 %.</p>
          <div className={`${styles.driverRows} health-observatory-driver-rows`}>
            <p><span><abbr title="Variabilité de la fréquence cardiaque">VFC nocturne</abbr><small> · 40 %</small></span><strong>{formatValue(scoreDriver(drivers, "hrv"))}</strong></p>
            <p><span>FC au repos<small> · 30 %</small></span><strong>{formatValue(scoreDriver(drivers, "restingHeartRate"))}</strong></p>
            <p><span>Sommeil<small> · 30 %</small></span><strong>{formatValue(scoreDriver(drivers, "sleep"))}</strong></p>
          </div>
        </section>

        <section className={`${styles.panel} ${styles.signalPanel} health-observatory-panel`} aria-labelledby="latest-signals-heading">
          <div className="health-observatory-panel-header"><h2 id="latest-signals-heading">Signaux récents</h2><span className={styles.filters}>Données de santé</span></div>
          <div className={`${styles.signalRows} health-recovery-signal-rows`}>
            {[["VFC nocturne", latest.hrv_ms, averages.hrv, "ms", 0], ["FC au repos", latest.resting_heart_rate, averages.restingHeartRate, "bpm", 0], ["Fréquence respiratoire", latest.respiratory_rate, averages.respiratoryRate, "rpm", 1]].map(([label, value, average, unit, decimals]) => <div className={`${styles.signalRow} health-observatory-row`} key={String(label)}><span>{label}</span><div><strong>{formatValue(value as number | null, decimals as number)}</strong>{unit ? <small>{unit}</small> : null}<em>avg {typeof average === "number" ? `${formatAverage(average, "decimal", decimals as number)}${unit === "bpm" || unit === "rpm" || unit === "ms" ? ` ${unit}` : unit}` : "—"}</em></div></div>)}
          </div>
        </section>

        <section className={`${styles.panel} ${styles.trendsPanel} health-observatory-panel`} aria-labelledby="recovery-trends-heading">
          <div className="health-observatory-panel-header"><h2 id="recovery-trends-heading">Tendances</h2><span className={styles.filters}>30 jours</span></div>
          <div className="metric-trend-grid health-observatory-trend-grid">
            {visibleTrendKeys.map((key) => <MetricTrendCard key={key} label={trendLabels[key].label} unit={trendLabels[key].unit} points={points(data.days, key)} direction={directionMap[trendLabels[key].direction]} animateCurrent compact />)}
            <HeartRateTrendCard samples={data.heartRateSamples} timezone={data.timezone} />
          </div>
        </section>

        <section className={`${styles.panel} ${styles.zonesPanel} health-observatory-panel`} aria-labelledby="weekly-zones-heading">
          <div className="health-observatory-panel-header"><h2 id="weekly-zones-heading">Zones cardiaques</h2><span className={styles.filters}>{weeklyZones.startDate && weeklyZones.endDate ? `${formatCivilDate(weeklyZones.startDate)} – ${formatCivilDate(weeklyZones.endDate)}` : "—"}</span></div>
          <p className={`${styles.supporting} health-observatory-note`}>Données de santé · moyenne quotidienne · jours mesurés uniquement</p>
          <WeeklyZoneChart summary={weeklyZones} />
        </section>
      </main> : <section className={`${styles.panel} ${styles.empty} health-observatory-panel health-observatory-empty`} aria-labelledby="recovery-empty-heading"><strong aria-hidden="true">+</strong><div><h2 id="recovery-empty-heading">Aucune donnée de récupération</h2><p>Synchronisez vos signaux de santé pour calculer une récupération personnalisée.</p></div></section>}
    </HealthPageShell>
  </div>;
}
