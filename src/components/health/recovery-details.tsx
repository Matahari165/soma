import { calculateSignalFreshness } from "@/domain/health/freshness";
import type { HealthAnalytics, HealthMetricDay, ScoreDay } from "@/services/health-analytics";

import { HeartRateCurve, ZoneDistribution } from "./health-charts";
import { averageLast30Measured, formatAverage, formatDurationMinutes, metricTone, type HealthMetricTone } from "./health-metric-utils";
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
function itemIsMissing(value: number | null) { return value === null || !Number.isFinite(value); }
function HeaderMetric({ label, value, unit, values, average, tone }: { label: string; value: string; unit?: string; values: Array<number | null>; average: string; tone: HealthMetricTone }) {
  const available = values.filter((candidate): candidate is number => candidate !== null && Number.isFinite(candidate));
  const min = available.length ? Math.min(...available) : 0;
  const max = available.length ? Math.max(...available) : 1;
  const valueClass = tone === "negative" ? styles.valueNegative : tone === "positive" ? styles.valuePositive : styles.valueNeutral;
  const barClass = tone === "negative" ? styles.barNegative : tone === "positive" ? styles.barPositive : styles.barNeutral;
  return <article className={styles.headerMetric}><span className={styles.metricLabel}>{label}</span><div className={styles.headerMetricBody}><div><strong className={valueClass}>{value}</strong>{unit ? <small>{unit}</small> : null}<p>Moy. 30 j · {average}</p></div><div className={styles.historyBars} aria-hidden="true">{values.map((item, index) => <i className={itemIsMissing(item) ? styles.barMissing : barClass} key={`${label}-${index}`} style={{ height: itemIsMissing(item) ? "20%" : `${max === min ? 58 : 28 + (((item ?? 0) - min) / (max - min)) * 52}%` }} />)}</div></div></article>;
}
function TrendCard({ label, unit, values, direction }: { label: string; unit: string; values: Array<{ date: string; value: number | null }>; direction: "higher" | "lower" | "context" }) {
  const available = values.filter((item): item is { date: string; value: number } => item.value !== null && Number.isFinite(item.value));
  const current = available.at(-1)?.value ?? null;
  const average = available.length ? available.reduce((sum, item) => sum + item.value, 0) / available.length : null;
  const min = available.length ? Math.min(...available.map((item) => item.value)) : 0;
  const max = available.length ? Math.max(...available.map((item) => item.value)) : 1;
  const averageHeight = average === null ? null : max === min ? 58 : 28 + ((average - min) / Math.max(max - min, 1)) * 68;
  const averageDescription = average === null ? "Moy. 30 j indisponible" : `Moy. 30 j · ${formatValue(average, 1)} ${unit}`;
  return <article className={styles.trendCard} aria-label={`${label}. Valeur actuelle : ${formatValue(current, 1)} ${unit}. ${averageDescription}. ${available.length} jours mesurés.`}><div className={styles.trendHeader}><div><span className={styles.metricLabel}>{label}</span><strong className={available.length ? styles.valuePositive : styles.valueNegative}>{formatValue(current, 1)}</strong><small>{unit}</small></div><span className={styles.trendDirection} aria-label={direction === "higher" ? "Plus haut est préférable" : direction === "lower" ? "Plus bas est préférable" : "Contexte"}>{direction === "higher" ? "↑" : direction === "lower" ? "↓" : "—"}</span></div><div className={styles.trendBarArea} aria-hidden="true">{averageHeight === null ? null : <span className={styles.trendAverageLine} style={{ bottom: `${averageHeight}%` }} /> }<div className={styles.trendBars}>{values.map((item, index) => <i key={`${item.date}-${index}`} className={item.value === null ? styles.barMissing : styles.barPositive} style={{ height: item.value === null ? "12%" : `${28 + ((item.value - min) / Math.max(max - min, 1)) * 68}%` }} />)}</div></div></article>;
}
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
  const trendValues = (key: TrendKind) => points(data.days, key).slice(-7);
  const recoveryValues = data.days.slice(-5).map((day) => data.scores.findLast((item) => item.kind === "recovery" && item.score_date === day.metric_date)?.score ?? null);
  return <div className={`${styles.page} health-detail-page health-detail-page--recovery`} id="main-page-content">
    <header className={styles.header}><h1>Récupération</h1><div className={styles.headerMetrics}><HeaderMetric label="Durée de sommeil" value={formatDurationMinutes(headerValues.sleep)} unit="/ 8 h" average={formatDurationMinutes(averages.sleep)} values={data.days.slice(-5).map((day) => day.sleep_minutes)} tone={headerTones.sleep} /><HeaderMetric label="Indice de récupération" value={formatValue(headerValues.recovery)} unit="%" average={formatValue(averages.recovery)} values={recoveryValues} tone={headerTones.recovery} /><HeaderMetric label="Charge du jour" value={formatValue(headerValues.strain)} unit="/ 21,0" average={formatValue(averages.strain)} values={data.days.slice(-5).map((day) => day.zone_minutes)} tone={headerTones.strain} /><HeaderMetric label="Énergie métabolique" value={formatValue(headerValues.energy)} unit="kcal" average={averages.energy === null ? "—" : `${formatAverage(averages.energy, "number")} kcal`} values={data.days.slice(-5).map((day) => day.total_energy_kcal)} tone={headerTones.energy} /></div></header>
    <div className={styles.content}><div className={styles.workbench}>
      <div className={styles.column}>
        <section className={styles.panel} aria-labelledby="recovery-overview-heading"><div className={styles.panelHeader}><h2 id="recovery-overview-heading">Vue d’ensemble de la récupération</h2></div><div className={styles.statGrid}><div className={`${styles.statWrap} ${styles.scoreWrap}`}><DataCard label="Score de récupération" value={formatValue(score)} tone={score === null ? "negative" : "positive"} /><div className={styles.scoreAction}><RecoveryScorePopover score={score} hrv={scoreDriver(drivers, "hrv")} restingHeartRate={scoreDriver(drivers, "restingHeartRate")} sleep={scoreDriver(drivers, "sleep")} /></div></div><DataCard label="Couverture des données" value={Number.isFinite(driverCoverage) ? `${Math.round(driverCoverage * 100)}%` : "—"} /></div><p className={styles.statusLine}>État · {score === null ? "signal récent en attente" : freshness.state === "current" ? "signal actuel" : freshness.state === "partial" ? "signal partiel" : freshness.state === "stale" ? "signal obsolète" : "signal indisponible"}</p><span className={styles.sectionLabel}>Facteurs du score</span><div className={styles.driverRows}><p>Variabilité nocturne · 40&nbsp;% <strong>{formatValue(scoreDriver(drivers, "hrv"))}</strong></p><p>Pouls au repos · 30&nbsp;% <strong>{formatValue(scoreDriver(drivers, "restingHeartRate"))}</strong></p><p>Contexte sommeil · 30&nbsp;% <strong>{formatValue(scoreDriver(drivers, "sleep"))}</strong></p></div></section>
        <section className={styles.panel} aria-labelledby="latest-signals-heading"><div className={styles.panelHeader}><h2 id="latest-signals-heading">Derniers signaux</h2></div><div className={styles.signalRows}>{[["Variabilité nocturne", latest?.hrv_ms ?? null, averages.hrv, "ms", 0], ["Pouls au repos", latest?.resting_heart_rate ?? null, averages.restingHeartRate, "bpm", 0], ["Plage cardiaque", heartMinimum === null || heartMaximum === null ? null : `${heartMinimum}–${heartMaximum}`, null, "bpm", 0], ["Saturation en oxygène", latest?.oxygen_saturation ?? null, averages.oxygenSaturation, "%", 1], ["Fréquence respiratoire", latest?.respiratory_rate ?? null, averages.respiratoryRate, "rpm", 1]].map(([label, value, average, unit, decimals]) => <div className={styles.signalRow} key={String(label)}><div><span>{label}</span><small>Source · signal de santé</small></div><div><strong>{typeof value === "string" ? value : formatValue(value as number | null, decimals as number)}</strong>{unit ? <small>{unit}</small> : null}<em>Moy. 30 j · {typeof average === "number" ? formatAverage(average, "decimal", decimals as number) : "—"}</em></div></div>)}</div></section>
        <section className={styles.panel} aria-labelledby="zones-heading"><div className={styles.panelHeader}><h2 id="zones-heading">Temps dans les zones cardiaques</h2></div><p className={styles.supporting}>Dernier jour complet · vide en l’absence de mesure</p><ZoneDistribution zones={[{ label: "Légère", minutes: latest?.light_zone_minutes ?? null, tone: "light" }, { label: "Modérée", minutes: latest?.moderate_zone_minutes ?? null, tone: "moderate" }, { label: "Vigoureuse", minutes: latest?.vigorous_zone_minutes ?? null, tone: "vigorous" }, { label: "Pic", minutes: latest?.peak_zone_minutes ?? null, tone: "peak" }]} /></section>
      </div>
      <div className={styles.column}>
        <section className={`${styles.panel} ${styles.trendsPanel}`} aria-labelledby="recovery-trends-heading"><div className={styles.panelHeader}><h2 id="recovery-trends-heading">Tendances de récupération</h2><span className={styles.filters}>Fenêtre observée : 1 mois</span></div><div className={styles.trendGrid}>{(Object.keys(trendLabels) as TrendKind[]).map((key) => <TrendCard key={key} label={trendLabels[key].label} unit={trendLabels[key].unit} values={trendValues(key)} direction={trendLabels[key].direction} />)}</div></section>
        <section className={`${styles.panel} ${styles.heartPanel}`} aria-labelledby="heart-rate-heading"><div className={styles.panelHeader}><h2 id="heart-rate-heading">Fréquence cardiaque au fil du jour</h2></div><HeartRateCurve samples={data.heartRateSamples} /></section>
        <section className={`${styles.panel} ${styles.provenancePanel}`} aria-labelledby="provenance-heading"><div className={styles.panelHeader}><h2 id="provenance-heading">Provenance des signaux</h2></div><div className={styles.provenanceRow}><span>Source · signal de santé</span><small>Absences conservées · absence de signal ≠ zéro</small></div></section>
      </div>
    </div></div>
  </div>;
}
