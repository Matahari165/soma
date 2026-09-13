import { Footprints } from "lucide-react";

import { calculateSignalFreshness } from "@/domain/health/freshness";
import { activityRegularity, completedActivityDays } from "@/domain/metrics/wellness";
import { calculateEffortScoreFromAvailable, diminishingLoad } from "@/domain/scores/effort";
import type { HealthAnalytics, HealthMetricDay, ScoreDay } from "@/services/health-analytics";

import { ActivityScoreOverview, type ActivityScoreBreakdown } from "./activity-score-overview";
import type { ActivityRadarDimension } from "./activity-radar";
import { HealthPageShell } from "./health-page-shell";
import { ZoneDistribution } from "./health-charts";
import { averageLast30Measured, formatAverage, latestSourceMeasuredAt, metricTone } from "./health-metric-utils";
import { MetricTrendCard } from "./metric-trend-card";
import styles from "./activity-redesign.module.css";

type EffortComponentId = "zoneMinutes" | "exerciseMinutes" | "activeEnergyKcal" | "steps";
type EffortComponentDefinition = { id: EffortComponentId; label: string; target: number; targetLabel: string; weight: number; unit: string; key: keyof HealthMetricDay; formula: string };

const effortComponents: readonly EffortComponentDefinition[] = [
  { id: "zoneMinutes", label: "Minutes en zone", target: 75, targetLabel: "75 min", weight: 50, unit: "min", key: "zone_minutes", formula: "rendement décroissant · référence 75 min" },
  { id: "exerciseMinutes", label: "Durée d’exercice", target: 60, targetLabel: "60 min", weight: 25, unit: "min", key: "exercise_minutes", formula: "rendement décroissant · référence 60 min" },
  { id: "activeEnergyKcal", label: "Calories actives", target: 700, targetLabel: "700 kcal", weight: 15, unit: "kcal", key: "active_energy_kcal", formula: "rendement décroissant · référence 700 kcal" },
  { id: "steps", label: "Pas", target: 12_000, targetLabel: "12 000 pas", weight: 10, unit: "pas", key: "steps", formula: "rendement décroissant · référence 12 000 pas" },
];

function measured(value: number | null | undefined): value is number { return typeof value === "number" && Number.isFinite(value); }
function points(days: HealthMetricDay[], key: keyof HealthMetricDay) { return days.map((day) => { const value = day[key]; return { date: day.metric_date, value: typeof value === "number" && Number.isFinite(value) ? value : null }; }); }
function number(value: number | null, unit?: string) { return !measured(value) ? "—" : `${Math.round(value).toLocaleString("fr-FR")}${unit ? ` ${unit}` : ""}`; }
function decimal(value: number | null, digits = 1) { return measured(value) ? value.toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "—"; }
function formatComponentValue(value: number | null, unit: string) { return !measured(value) ? "Indisponible" : `${Math.round(value).toLocaleString("fr-FR")} ${unit}`; }

function averageScores(scores: ScoreDay[], endDate: string | undefined) {
  if (!endDate) return null;
  const end = new Date(`${endDate}T12:00:00.000Z`);
  if (!Number.isFinite(end.getTime())) return null;
  end.setUTCDate(end.getUTCDate() - 29);
  const startDate = end.toISOString().slice(0, 10);
  const values = scores.filter((item) => item.kind === "effort" && item.score_date >= startDate && item.score_date <= endDate).map((item) => item.score).filter(measured);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function activityScoreBreakdown(latest: HealthMetricDay | undefined): ActivityScoreBreakdown | null {
  if (!latest) return null;
  const values = effortComponents.map((component) => ({ ...component, value: latest[component.key] as number | null }));
  const result = calculateEffortScoreFromAvailable({ zoneMinutes: latest.zone_minutes, activeEnergyKcal: latest.active_energy_kcal, exerciseMinutes: latest.exercise_minutes, steps: latest.steps });
  const availableWeight = values.filter((component) => measured(component.value)).reduce((sum, component) => sum + component.weight, 0);
  const components = values.map((component) => {
    const normalizedValue = measured(component.value) ? Math.min(1, Math.max(0, diminishingLoad(component.value, component.target))) : null;
    return {
      id: component.id, label: component.label, weight: component.weight, sourceValueLabel: formatComponentValue(component.value, component.unit), targetLabel: component.targetLabel, normalizedValue,
      contribution: normalizedValue === null || availableWeight === 0 ? null : normalizedValue * component.weight / availableWeight * 100,
      formula: component.formula, normalization: `sous-score ${normalizedValue === null ? "indisponible" : `${Math.round(normalizedValue * 100)} /100`}`,
    };
  });
  return { score: result.score, algorithmVersion: result.algorithmVersion, coverage: result.coverage, components };
}

function comparison(value: number | null, average: number | null): ActivityRadarDimension["comparison"] {
  if (!measured(value) || !measured(average)) return null;
  if (Math.abs(value - average) < 0.005) return "equal";
  return value > average ? "up" : "down";
}
function comparisonLabel(average: number | null, unit: string) { return measured(average) ? `Moy. 30 j · ${formatComponentValue(average, unit)}` : undefined; }
function exerciseTypeLabel(type: string) {
  const labels: Record<string, string> = { RUNNING: "Course", WALKING: "Marche", HIKING: "Randonnée", CYCLING: "Vélo", SWIMMING: "Natation", WEIGHT_TRAINING: "Renforcement musculaire", YOGA: "Yoga", HIIT: "HIIT", OTHER: "Autre" };
  const normalized = type.trim().replaceAll("-", "_").toUpperCase();
  return labels[normalized] ?? normalized.toLocaleLowerCase("fr-FR").replaceAll("_", " ");
}

export function ActivityDetails({ data }: { data: HealthAnalytics }) {
  const currentDate = new Intl.DateTimeFormat("en-CA", { timeZone: data.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const activityDays = completedActivityDays(data.days, currentDate);
  const latest = activityDays.at(-1);
  const effortScores = data.scores.filter((item) => item.kind === "effort");
  const scoreBreakdown = activityScoreBreakdown(latest);
  const latestEffort = latest ? effortScores.findLast((item) => item.score_date === latest.metric_date) : undefined;
  const persistedScore = latestEffort?.score ?? null;
  // Persisted scores remain authoritative for the headline and 30-day average.
  // The radar/breakdown is always recomputed from the four raw inputs so a
  // stale preview or legacy row cannot turn into a made-up component.
  const score = persistedScore ?? scoreBreakdown?.score ?? null;
  const averages = {
    steps: latest ? averageLast30Measured(activityDays, "steps", latest.metric_date) : null,
    zoneMinutes: latest ? averageLast30Measured(activityDays, "zone_minutes", latest.metric_date) : null,
    exerciseMinutes: latest ? averageLast30Measured(activityDays, "exercise_minutes", latest.metric_date) : null,
    activeCalories: latest ? averageLast30Measured(activityDays, "active_energy_kcal", latest.metric_date) : null,
    effort: averageScores(effortScores, latest?.metric_date),
    weeklyLoad: latest ? averageLast30Measured(activityDays, "weekly_load", latest.metric_date) : null,
    acuteChronicLoadRatio: latest ? averageLast30Measured(activityDays, "acute_chronic_load_ratio", latest.metric_date) : null,
  };
  const regularity = activityRegularity(activityDays.slice(-28).map((day) => ({ steps: day.steps, activeZoneMinutes: day.zone_minutes, activeMinutes: day.active_minutes, effortScore: effortScores.findLast((item) => item.score_date === day.metric_date)?.score ?? null })));
  const scoreCoverage = score === null ? null : scoreBreakdown?.coverage ?? null;
  const freshness = calculateSignalFreshness({ measuredAt: latestSourceMeasuredAt(latest), importedAt: data.importedAt, coverage: scoreCoverage ?? 0 });
  const radarDimensions: ActivityRadarDimension[] = latest ? effortComponents.map((component) => {
    const value = latest[component.key] as number | null;
    const average = component.id === "steps" ? averages.steps : component.id === "zoneMinutes" ? averages.zoneMinutes : component.id === "exerciseMinutes" ? averages.exerciseMinutes : averages.activeCalories;
    const breakdown = scoreBreakdown?.components.find((item) => item.id === component.id);
    return {
      id: component.id, label: component.label, normalizedValue: breakdown?.normalizedValue ?? null, valueLabel: formatComponentValue(value, component.unit), averageLabel: comparisonLabel(average, component.unit),
      definition: component.id === "zoneMinutes" ? "Temps cumulé dans les zones d’intensité mesurées." : component.id === "exerciseMinutes" ? "Durée d’exercice enregistrée par la source de santé." : component.id === "activeEnergyKcal" ? "Énergie active estimée par la source de santé." : "Nombre de pas enregistrés sur la journée.",
      readingDirection: "Plus élevé = plus de charge accomplie", scoreRole: `Composante du score d’effort · ${component.weight} %`, scoreWeight: component.weight, scoreFormula: component.formula, scoreNormalization: "rendement décroissant, puis pondération", scoreContribution: breakdown?.contribution ?? null, comparison: comparison(value, average), comparisonLabel: comparisonLabel(average, component.unit), comparisonTone: metricTone(value, average, "higher_is_better"),
    };
  }) : [];
  const latestExercise = data.exercises.at(0);

  return <div className={styles.root}>
    <HealthPageShell kind="activity" title="Effort" description="Score d’effort fondé sur les minutes en zone, l’exercice, l’énergie active et les pas." score={score} freshness={freshness} timezone={data.timezone} showFreshness={false} heroScore={<span className="sr-only">Score d’effort : {score === null ? "indisponible" : `${score} sur 100`}. Moyenne sur 30 jours : {averages.effort === null ? "indisponible" : `${Math.round(averages.effort)} sur 100`}. {scoreCoverage === null ? "Couverture du score indisponible" : `${Math.round(scoreCoverage * 100)} % de couverture du score`}.</span>}>
      <main className={`${styles.content} health-observatory-content`}>
        {latest ? <>
          <section className={`${styles.heroScene} health-observatory-panel`} aria-labelledby="activity-score-summary-title"><div className={styles.radarRegion}><ActivityScoreOverview dimensions={radarDimensions} score={score} average={averages.effort} coverage={scoreCoverage} breakdown={scoreBreakdown} persistedScore={persistedScore} /></div></section>
          <section className={`${styles.section} health-observatory-panel`} aria-labelledby="activity-readings-heading"><header className={styles.sectionHeader}><h2 id="activity-readings-heading">Repères</h2><span>{latest.metric_date}</span></header><dl className={styles.readingsGrid}><div><dt>Charge hebdomadaire</dt><dd>{number(latest.weekly_load)}</dd><small>Moy. 30 j · {formatAverage(averages.weeklyLoad, "number")}</small></div><div><dt>Ratio charge récente / habituelle</dt><dd>{measured(latest.acute_chronic_load_ratio) ? `${decimal(latest.acute_chronic_load_ratio, 2)}×` : "—"}</dd><small>Moy. 30 j · {decimal(averages.acuteChronicLoadRatio, 2)}×</small></div><div><dt>Régularité · 28 j</dt><dd>{regularity.consistencyScore === null ? "—" : `${regularity.consistencyScore} %`}</dd><small>{regularity.observedDays} jours observés</small></div><div><dt>Jours actifs · 28 j</dt><dd>{regularity.activeDayRate === null ? "—" : `${regularity.activeDayRate} %`}</dd><small>{regularity.activeDays} jours actifs</small></div></dl></section>
          <section className={`${styles.section} health-observatory-panel`} aria-labelledby="activity-trends-heading"><header className={styles.sectionHeader}><h2 id="activity-trends-heading">Tendances</h2><span>30 jours</span></header><div className={styles.trendGrid}><MetricTrendCard label="Minutes en zone" points={points(activityDays, "zone_minutes")} unit="min" direction="higher_is_better" format={(value) => Math.round(value).toString()} valueFormat="number" compact animateCurrent animationFormat="number" /><MetricTrendCard label="Durée d’exercice" points={points(activityDays, "exercise_minutes")} unit="min" direction="higher_is_better" format={(value) => Math.round(value).toString()} valueFormat="number" compact animateCurrent animationFormat="number" /><MetricTrendCard label="Calories actives" points={points(activityDays, "active_energy_kcal")} unit="kcal" direction="higher_is_better" format={(value) => Math.round(value).toString()} valueFormat="number" compact animateCurrent animationFormat="number" /><MetricTrendCard label="Pas" points={points(activityDays, "steps")} direction="higher_is_better" format={(value) => Math.round(value).toLocaleString("fr-FR")} valueFormat="number" compact animateCurrent animationFormat="number" /><MetricTrendCard label="Charge hebdomadaire" points={points(activityDays, "weekly_load")} direction="context_only" format={(value) => Math.round(value).toLocaleString("fr-FR")} valueFormat="number" compact animateCurrent animationFormat="number" /><MetricTrendCard label="Régularité de l’effort" points={points(activityDays, "activity_consistency_28d")} unit="%" direction="higher_is_better" format={(value) => Math.round(value).toString()} valueFormat="number" compact animateCurrent animationFormat="number" /></div></section>
          <section className={`${styles.section} health-observatory-panel`} aria-labelledby="activity-zones-heading"><header className={styles.sectionHeader}><h2 id="activity-zones-heading">Zones cardiaques</h2><span>{number(latest.zone_minutes, "min")}</span></header><ZoneDistribution zones={[{ label: "Légère", minutes: latest.light_zone_minutes, tone: "light" }, { label: "Modérée", minutes: latest.moderate_zone_minutes, tone: "moderate" }, { label: "Vigoureuse", minutes: latest.vigorous_zone_minutes, tone: "vigorous" }, { label: "Pic", minutes: latest.peak_zone_minutes, tone: "peak" }]} /></section>
          {latestExercise && <details className={`${styles.section} ${styles.sessionDetails} health-observatory-panel`}><summary><span>Dernière séance · {latestExercise.name}</span><small>{exerciseTypeLabel(latestExercise.type)}</small></summary><dl className={styles.exerciseDetailGrid}><div><dt>Durée</dt><dd>{number(latestExercise.durationMinutes, "min")}</dd></div><div><dt>Calories</dt><dd>{number(latestExercise.calories, "kcal")}</dd></div><div><dt>Distance</dt><dd>{measured(latestExercise.distanceKm) ? `${latestExercise.distanceKm.toFixed(2)} km` : "—"}</dd></div><div><dt>FC moyenne</dt><dd>{number(latestExercise.averageHeartRate, "bpm")}</dd></div><div><dt>Min. en zone</dt><dd>{number(latestExercise.zoneMinutes, "min")}</dd></div><div><dt>Dénivelé</dt><dd>{number(latestExercise.elevationGainMeters, "m")}</dd></div></dl></details>}
          <section className={`${styles.section} health-observatory-panel`} aria-labelledby="activity-sessions-heading"><header className={styles.sectionHeader}><h2 id="activity-sessions-heading">Séances récentes</h2><span>{data.exercises.length} séances</span></header>{data.exercises.length ? <div className={styles.exerciseTableWrap} role="region" aria-label="Séances récentes, tableau à défilement horizontal" tabIndex={0}><table className={styles.exerciseTable}><thead><tr><th>Session</th><th>Date</th><th>Durée</th><th>Calories</th><th>Distance</th><th>FC moyenne</th><th>Min. en zone</th></tr></thead><tbody>{data.exercises.map((exercise) => <tr key={exercise.id}><th scope="row"><Footprints size={15} aria-hidden="true" />{exercise.name}<small>{exerciseTypeLabel(exercise.type)}</small></th><td>{exercise.date}</td><td>{number(exercise.durationMinutes, "min")}</td><td>{number(exercise.calories, "kcal")}</td><td>{measured(exercise.distanceKm) ? `${exercise.distanceKm.toFixed(2)} km` : "—"}</td><td>{number(exercise.averageHeartRate, "bpm")}</td><td>{number(exercise.zoneMinutes, "min")}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>Aucune séance mesurée.</p>}</section>
        </> : <section className={`${styles.empty} health-observatory-panel`} aria-labelledby="activity-empty-heading"><Footprints size={24} aria-hidden="true" /><div><h2 id="activity-empty-heading">Aucune donnée d’effort</h2><p>Aucune journée mesurée sur la période.</p></div></section>}
      </main>
    </HealthPageShell>
  </div>;
}
