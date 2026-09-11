import { calculateSignalFreshness } from "@/domain/health/freshness";
import type { HealthAnalytics, HealthMetricDay, ScoreDay } from "@/services/health-analytics";

import { HeartRateCurve, ZoneDistribution } from "./health-charts";
import { averageLast30Measured, formatAverage, formatDurationMinutes, metricTone } from "./health-metric-utils";
import { HealthHeroScore, HealthPageShell } from "./health-page-shell";
import { MetricTrendCard } from "./metric-trend-card";
import { RecoveryScorePopover } from "./recovery-score-popover";
import styles from "./recovery-redesign.module.css";

type TrendKind = "hrv" | "resting_heart_rate" | "oxygen_saturation" | "respiratory_rate" | "skin_temperature_delta" | "vo2_max";
const trendLabels: Record<TrendKind, { label: string; unit: string; direction: "higher" | "lower" | "context" }> = {
  hrv: { label: "Variabilité nocturne", unit: "ms", direction: "higher" }, resting_heart_rate: { label: "Pouls au repos", unit: "bpm", direction: "lower" }, oxygen_saturation: { label: "Saturation en oxygène", unit: "%", direction: "context" }, respiratory_rate: { label: "Fréquence respiratoire", unit: "rpm", direction: "context" }, skin_temperature_delta: { label: "Écart de température", unit: "°", direction: "context" }, vo2_max: { label: "VO₂ max", unit: "ml/kg/min", direction: "higher" },
};
const metricKeys: Record<TrendKind, keyof HealthMetricDay> = { hrv: "hrv_ms", resting_heart_rate: "resting_heart_rate", oxygen_saturation: "oxygen_saturation", respiratory_rate: "respiratory_rate", skin_temperature_delta: "skin_temperature_delta", vo2_max: "vo2_max" };
const points = (days: HealthMetricDay[], key: TrendKind) => days.map((day) => { const value = day[metricKeys[key]]; return { date: day.metric_date, value: typeof value === "number" ? value : null }; });
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

function DataCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "positive" | "negative" }) {
  return <div className={`${styles.statBox} ${tone === "positive" ? styles.statBoxPositive : tone === "negative" ? styles.statBoxNegative : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

const directionMap: Record<string, "higher_is_better" | "lower_is_better" | "context_only"> = {
  higher: "higher_is_better",
  lower: "lower_is_better",
  context: "context_only",
};

export function RecoveryDetails({ data }: { data: HealthAnalytics }) {
  const latest = data.days.findLast((day) => (day.hrv_ms !== null && day.hrv_ms > 0) || (day.resting_heart_rate !== null && day.resting_heart_rate > 0));
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
  const coverage = Number.isFinite(driverCoverage) ? driverCoverage : latest ? [latest.hrv_ms, latest.resting_heart_rate].filter((value) => value !== null).length / 3 : 0;
  const recoveryMeasurements = latest ? ["daily-heart-rate-variability", "daily-resting-heart-rate"].map((type) => latest.source_freshness?.byType?.[type]).filter((value): value is string => Boolean(value)).sort() : [];
  const freshness = calculateSignalFreshness({ measuredAt: recoveryMeasurements.at(-1) ?? latest?.source_freshness?.latestMeasuredAt ?? latest?.metric_date, importedAt: data.importedAt, coverage });
  const recoveryValues = data.days.slice(-5).map((day) => data.scores.findLast((item) => item.kind === "recovery" && item.score_date === day.metric_date)?.score ?? null);
  const heroScoreTone = headerTones.recovery === "positive" ? "positive" : headerTones.recovery === "negative" ? "negative" : "neutral";

  const heroMetrics = <>
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
  </>;

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
          action={<RecoveryScorePopover score={score} hrv={scoreDriver(drivers, "hrv")} restingHeartRate={scoreDriver(drivers, "restingHeartRate")} sleep={scoreDriver(drivers, "sleep")} />}
        />
      }
      heroMetrics={heroMetrics}
    >
      <div className={styles.content}><div className={styles.workbench}>
        <div className={styles.column}>
          <section className={styles.panel} aria-labelledby="recovery-overview-heading"><div className={styles.panelHeader}><h2 id="recovery-overview-heading">Vue d’ensemble de la récupération</h2></div><div className={styles.statGrid}><div className={`${styles.statWrap} ${styles.scoreWrap}`}><DataCard label="Score de récupération" value={formatValue(score)} tone={score === null ? "negative" : "positive"} /><div className={styles.scoreAction}><RecoveryScorePopover score={score} hrv={scoreDriver(drivers, "hrv")} restingHeartRate={scoreDriver(drivers, "restingHeartRate")} sleep={scoreDriver(drivers, "sleep")} /></div></div><DataCard label="Couverture des données" value={Number.isFinite(driverCoverage) ? `${Math.round(driverCoverage * 100)}%` : "—"} /></div><p className={styles.statusLine}>État · {score === null ? "signal récent en attente" : freshness.state === "current" ? "signal actuel" : freshness.state === "partial" ? "signal partiel" : freshness.state === "stale" ? "signal obsolète" : "signal indisponible"}</p><span className={styles.sectionLabel}>Facteurs du score</span><div className={styles.driverRows}><p>Variabilité nocturne · 40&nbsp;% <strong>{formatValue(scoreDriver(drivers, "hrv"))}</strong></p><p>Pouls au repos · 30&nbsp;% <strong>{formatValue(scoreDriver(drivers, "restingHeartRate"))}</strong></p><p>Contexte sommeil · 30&nbsp;% <strong>{formatValue(scoreDriver(drivers, "sleep"))}</strong></p></div></section>
          <section className={styles.panel} aria-labelledby="latest-signals-heading"><div className={styles.panelHeader}><h2 id="latest-signals-heading">Derniers signaux</h2></div><div className={styles.signalRows}>{[["Variabilité nocturne", latest?.hrv_ms ?? null, averages.hrv, "ms", 0], ["Pouls au repos", latest?.resting_heart_rate ?? null, averages.restingHeartRate, "bpm", 0], ["Plage cardiaque", heartMinimum === null || heartMaximum === null ? null : `${heartMinimum}–${heartMaximum}`, null, "bpm", 0], ["Saturation en oxygène", latest?.oxygen_saturation ?? null, averages.oxygenSaturation, "%", 1], ["Fréquence respiratoire", latest?.respiratory_rate ?? null, averages.respiratoryRate, "rpm", 1]].map(([label, value, average, unit, decimals]) => <div className={styles.signalRow} key={String(label)}><div><span>{label}</span><small>Source · signal de santé</small></div><div><strong>{typeof value === "string" ? value : formatValue(value as number | null, decimals as number)}</strong>{unit ? <small>{unit}</small> : null}<em>Moy. 30 j · {typeof average === "number" ? formatAverage(average, "decimal", decimals as number) : "—"}</em></div></div>)}</div></section>
          <section className={styles.panel} aria-labelledby="zones-heading"><div className={styles.panelHeader}><h2 id="zones-heading">Temps dans les zones cardiaques</h2></div><p className={styles.supporting}>Dernier jour complet · vide en l’absence de mesure</p><ZoneDistribution zones={[{ label: "Légère", minutes: latest?.light_zone_minutes ?? null, tone: "light" }, { label: "Modérée", minutes: latest?.moderate_zone_minutes ?? null, tone: "moderate" }, { label: "Vigoureuse", minutes: latest?.vigorous_zone_minutes ?? null, tone: "vigorous" }, { label: "Pic", minutes: latest?.peak_zone_minutes ?? null, tone: "peak" }]} /></section>
        </div>
        <div className={styles.column}>
          <section className={`${styles.panel} ${styles.trendsPanel}`} aria-labelledby="recovery-trends-heading"><div className={styles.panelHeader}><h2 id="recovery-trends-heading">Tendances de récupération</h2><span className={styles.filters}>Fenêtre observée : 1 mois</span></div><div className="metric-trend-grid">{(Object.keys(trendLabels) as TrendKind[]).map((key) => <MetricTrendCard key={key} label={trendLabels[key].label} unit={trendLabels[key].unit} points={points(data.days, key)} direction={directionMap[trendLabels[key].direction]} animateCurrent />)}</div></section>
          <section className={`${styles.panel} ${styles.heartPanel}`} aria-labelledby="heart-rate-heading"><div className={styles.panelHeader}><h2 id="heart-rate-heading">Fréquence cardiaque au fil du jour</h2></div><HeartRateCurve samples={data.heartRateSamples} /></section>
          <section className={`${styles.panel} ${styles.provenancePanel}`} aria-labelledby="provenance-heading"><div className={styles.panelHeader}><h2 id="provenance-heading">Provenance des signaux</h2></div><div className={styles.provenanceRow}><span>Source · signal de santé</span><small>Absences conservées · absence de signal ≠ zéro</small></div></section>
        </div>
      </div></div>
    </HealthPageShell>
  </div>;
}
