import { calculateSignalFreshness } from "@/domain/health/freshness";
import type { HealthAnalytics, HealthMetricDay, ScoreDay } from "@/services/health-analytics";

import { HeartRateCurve, ZoneDistribution } from "./health-charts";
import { averageLast30Measured, formatAverage, formatDurationMinutes, latestSourceMeasuredAt, measuredCoverage, metricTone } from "./health-metric-utils";
import { HealthHeroScore, HealthPageShell } from "./health-page-shell";
import { MetricTrendCard } from "./metric-trend-card";
import { RecoveryScorePopover } from "./recovery-score-popover";
import styles from "./recovery-redesign.module.css";

type TrendKind = "hrv" | "resting_heart_rate" | "oxygen_saturation" | "respiratory_rate" | "skin_temperature_delta" | "vo2_max";
const trendLabels: Record<TrendKind, { label: string; unit: string; direction: "higher" | "lower" | "context" }> = {
  hrv: { label: "VFC nocturne", unit: "ms", direction: "higher" }, resting_heart_rate: { label: "Pouls au repos", unit: "bpm", direction: "lower" }, oxygen_saturation: { label: "Saturation en oxygène", unit: "%", direction: "context" }, respiratory_rate: { label: "Fréquence respiratoire", unit: "rpm", direction: "context" }, skin_temperature_delta: { label: "Écart de température", unit: "°", direction: "context" }, vo2_max: { label: "VO₂ max", unit: "ml/kg/min", direction: "higher" },
};
const metricKeys: Record<TrendKind, keyof HealthMetricDay> = { hrv: "hrv_ms", resting_heart_rate: "resting_heart_rate", oxygen_saturation: "oxygen_saturation", respiratory_rate: "respiratory_rate", skin_temperature_delta: "skin_temperature_delta", vo2_max: "vo2_max" };
const points = (days: HealthMetricDay[], key: TrendKind) => days.map((day) => { const value = day[metricKeys[key]]; return { date: day.metric_date, value: typeof value === "number" && Number.isFinite(value) ? value : null }; });
function formatValue(value: number | null, decimals = 0) { return value === null || !Number.isFinite(value) ? "—" : value.toFixed(decimals).replace(/\.0+$/, ""); }
function scoreDriver(drivers: Record<string, unknown> | undefined, key: string) { const value = drivers?.[key]; return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null; }
function averageLast30Scores(scores: ScoreDay[], kind: ScoreDay["kind"], endDate: string | undefined) {
  const latestDate = endDate ?? scores.filter((item) => item.kind === kind).map((item) => item.score_date).sort().at(-1);
  if (!latestDate) return null;
  const start = new Date(`${latestDate}T12:00:00.000Z`);
  if (!Number.isFinite(start.getTime())) return null;
  start.setUTCDate(start.getUTCDate() - 29);
  const startDate = start.toISOString().slice(0, 10);
  const values = scores.filter((item) => item.kind === kind && item.score_date >= startDate && item.score_date <= latestDate && typeof item.score === "number" && Number.isFinite(item.score)).map((item) => item.score as number);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

const directionMap: Record<string, "higher_is_better" | "lower_is_better" | "context_only"> = {
  higher: "higher_is_better",
  lower: "lower_is_better",
  context: "context_only",
};

const visibleTrendKeys: TrendKind[] = ["hrv", "resting_heart_rate", "respiratory_rate", "oxygen_saturation"];

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

export function RecoveryDetails({ data }: { data: HealthAnalytics }) {
  const latest = data.days.findLast(hasRecoveryMeasurement);
  const recoveryScore = data.scores.findLast((item) => item.kind === "recovery" && item.score_date === latest?.metric_date);
  const score = recoveryScore?.score ?? null;
  const heartRates = data.heartRateSamples.map((sample) => sample.bpm);
  const heartMinimum = heartRates.length ? Math.min(...heartRates) : null;
  const heartMaximum = heartRates.length ? Math.max(...heartRates) : null;
  const averages = { hrv: latest ? averageLast30Measured(data.days, "hrv_ms", latest.metric_date) : null, restingHeartRate: latest ? averageLast30Measured(data.days, "resting_heart_rate", latest.metric_date) : null, oxygenSaturation: latest ? averageLast30Measured(data.days, "oxygen_saturation", latest.metric_date) : null, respiratoryRate: latest ? averageLast30Measured(data.days, "respiratory_rate", latest.metric_date) : null, sleep: latest ? averageLast30Measured(data.days, "sleep_minutes", latest.metric_date) : null, recovery: averageLast30Scores(data.scores, "recovery", latest?.metric_date), strain: latest ? averageLast30Measured(data.days, "zone_minutes", latest.metric_date) : null, energy: latest ? averageLast30Measured(data.days, "total_energy_kcal", latest.metric_date) : null };
  const headerValues = { sleep: latest?.sleep_minutes ?? null, recovery: score, strain: latest?.zone_minutes ?? null, energy: latest?.total_energy_kcal ?? null };
  const headerTones = { sleep: metricTone(headerValues.sleep, averages.sleep, "higher_is_better"), recovery: metricTone(headerValues.recovery, averages.recovery, "higher_is_better"), strain: metricTone(headerValues.strain, averages.strain, "context_only"), energy: metricTone(headerValues.energy, averages.energy, "higher_is_better") };
  const drivers = recoveryScore?.drivers;
  const driverCoverage = Number(drivers?.coverage);
  const coverage = Number.isFinite(driverCoverage)
    ? Math.min(1, Math.max(0, driverCoverage))
    : latest
      ? measuredCoverage([latest.hrv_ms, latest.resting_heart_rate, latest.sleep_minutes])
      : 0;
  const freshness = calculateSignalFreshness({ measuredAt: latestSourceMeasuredAt(latest), importedAt: data.importedAt, coverage });
  const recoveryValues = data.days.slice(-5).map((day) => data.scores.findLast((item) => item.kind === "recovery" && item.score_date === day.metric_date)?.score ?? null);
  const heroScoreTone = headerTones.recovery === "positive" ? "positive" : headerTones.recovery === "negative" ? "negative" : "neutral";

  const heroMetrics = latest ? <>
    <div className={`health-hero-stat metric-tone--${headerTones.sleep}`}>
      <span>Durée de sommeil</span>
      <strong className={`metric-reading metric-reading--${headerTones.sleep}`}>
        <span>{formatDurationMinutes(headerValues.sleep)}</span>
        <small>/ 8 h</small>
      </strong>
      <small className="health-hero-stat__average">Moy. 30 j · {formatDurationMinutes(averages.sleep)}</small>
    </div>
    <div className={`health-hero-stat metric-tone--${headerTones.strain}`}>
      <span>Charge du jour</span>
      <strong className={`metric-reading metric-reading--${headerTones.strain}`}>
        <span>{formatValue(headerValues.strain)}</span>
        <small>/ 21,0</small>
      </strong>
      <small className="health-hero-stat__average">Moy. 30 j · {formatValue(averages.strain)}</small>
    </div>
    <div className={`health-hero-stat metric-tone--${headerTones.energy}`}>
      <span>Énergie métabolique</span>
      <strong className={`metric-reading metric-reading--${headerTones.energy}`}>
        <span>{formatValue(headerValues.energy)}</span>
        <small>kcal</small>
      </strong>
      <small className="health-hero-stat__average">Moy. 30 j · {averages.energy === null ? "—" : `${formatAverage(averages.energy, "number")} kcal`}</small>
    </div>
  </> : undefined;

  return <div className={styles.page}>
    <HealthPageShell
      kind="recovery"
      title="Récupération"
      description="Score, VFC et signaux de récupération nocturne."
      score={score}
      freshness={freshness}
      timezone={data.timezone}
      heroScore={
        <HealthHeroScore
          label="Score de récupération"
          value={score}
          average={averages.recovery}
          values={recoveryValues}
          tone={heroScoreTone}
          action={latest ? <RecoveryScorePopover score={score} hrv={scoreDriver(drivers, "hrv")} restingHeartRate={scoreDriver(drivers, "restingHeartRate")} sleep={scoreDriver(drivers, "sleep")} /> : undefined}
        />
      }
      heroMetrics={heroMetrics}
    >
      {latest ? <div className={`${styles.content} health-observatory-content`}><div className={`${styles.workbench} health-observatory-workbench`}>
        <div className={`${styles.column} health-observatory-column`}>
          <section className={`${styles.panel} health-observatory-panel`} aria-labelledby="recovery-drivers-heading"><div className={`${styles.panelHeader} health-observatory-panel-header`}><h2 id="recovery-drivers-heading">Facteurs du score</h2><span className={styles.filters}>{Number.isFinite(driverCoverage) ? `${Math.round(driverCoverage * 100)} % couverts` : `${Math.round(coverage * 100)} % couverts`}</span></div><p className={`${styles.calculatedBy} health-observatory-note`}>Calcul Soma · facteurs pondérés selon les mesures disponibles.</p><div className={`${styles.driverRows} health-observatory-driver-rows`}><p><abbr title="Variabilité de la fréquence cardiaque">VFC nocturne</abbr> · 40&nbsp;% <strong>{formatValue(scoreDriver(drivers, "hrv"))}</strong></p><p>Pouls au repos · 30&nbsp;% <strong>{formatValue(scoreDriver(drivers, "restingHeartRate"))}</strong></p><p>Contexte sommeil · 30&nbsp;% <strong>{formatValue(scoreDriver(drivers, "sleep"))}</strong></p></div></section>
          <section className={`${styles.panel} health-observatory-panel`} aria-labelledby="latest-signals-heading"><div className={`${styles.panelHeader} health-observatory-panel-header`}><h2 id="latest-signals-heading">Derniers signaux</h2><span className={styles.filters}>Données de santé</span></div><div className={styles.signalRows}>{[["VFC nocturne", latest?.hrv_ms ?? null, averages.hrv, "ms", 0], ["Pouls au repos", latest?.resting_heart_rate ?? null, averages.restingHeartRate, "bpm", 0], ["Plage cardiaque", heartMinimum === null || heartMaximum === null ? null : `${heartMinimum}–${heartMaximum}`, null, "bpm", 0], ["Saturation en oxygène", latest?.oxygen_saturation ?? null, averages.oxygenSaturation, "%", 1], ["Fréquence respiratoire", latest?.respiratory_rate ?? null, averages.respiratoryRate, "rpm", 1]].map(([label, value, average, unit, decimals]) => <div className={`${styles.signalRow} health-observatory-row`} key={String(label)}><div><span>{label}</span></div><div><strong>{typeof value === "string" ? value : formatValue(value as number | null, decimals as number)}</strong>{unit ? <small>{unit}</small> : null}<em>Moy. 30 j · {typeof average === "number" ? formatAverage(average, "decimal", decimals as number) : "—"}</em></div></div>)}</div></section>
          <section className={`${styles.panel} health-observatory-panel`} aria-labelledby="zones-heading"><div className={`${styles.panelHeader} health-observatory-panel-header`}><h2 id="zones-heading">Temps dans les zones cardiaques</h2></div><p className={`${styles.supporting} health-observatory-note`}>Dernier jour complet · vide en l’absence de mesure</p><ZoneDistribution zones={[{ label: "Légère", minutes: latest?.light_zone_minutes ?? null, tone: "light" }, { label: "Modérée", minutes: latest?.moderate_zone_minutes ?? null, tone: "moderate" }, { label: "Vigoureuse", minutes: latest?.vigorous_zone_minutes ?? null, tone: "vigorous" }, { label: "Pic", minutes: latest?.peak_zone_minutes ?? null, tone: "peak" }]} /></section>
        </div>
        <div className={`${styles.column} health-observatory-column`}>
          <section className={`${styles.panel} ${styles.trendsPanel} health-observatory-panel health-observatory-trends-panel`} aria-labelledby="recovery-trends-heading"><div className={`${styles.panelHeader} health-observatory-panel-header`}><h2 id="recovery-trends-heading">Tendances de récupération</h2><span className={styles.filters}>4 signaux · 1 mois</span></div><div className="metric-trend-grid health-observatory-trend-grid">{visibleTrendKeys.map((key) => <MetricTrendCard key={key} label={trendLabels[key].label} unit={trendLabels[key].unit} points={points(data.days, key)} direction={directionMap[trendLabels[key].direction]} animateCurrent />)}</div></section>
          <section className={`${styles.panel} ${styles.heartPanel} health-observatory-panel health-observatory-heart-panel`} aria-labelledby="heart-rate-heading"><div className={`${styles.panelHeader} health-observatory-panel-header`}><h2 id="heart-rate-heading">Fréquence cardiaque au fil du jour</h2></div><HeartRateCurve samples={data.heartRateSamples} /></section>
        </div>
      </div></div> : <section className={`${styles.panel} ${styles.empty} health-observatory-panel health-observatory-empty`} aria-labelledby="recovery-empty-heading"><strong aria-hidden="true">+</strong><div><h2 id="recovery-empty-heading">Aucune donnée de récupération</h2><p>Synchronisez vos signaux de santé pour calculer une récupération personnalisée.</p></div></section>}
    </HealthPageShell>
  </div>;
}
