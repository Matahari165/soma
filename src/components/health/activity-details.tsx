import { Footprints } from "lucide-react";

import { calculateSignalFreshness } from "@/domain/health/freshness";
import { activityRegularity, completedActivityDays } from "@/domain/metrics/wellness";
import type { HealthAnalytics, HealthMetricDay, ScoreDay } from "@/services/health-analytics";

import { HealthHeroScore, HealthPageShell } from "./health-page-shell";
import { ZoneDistribution } from "./health-charts";
import { ActivityRegularityCard, ActivityScorePopover } from "./activity-explanation-popover";
import { AnimatedMetricReading } from "./animated-value";
import { averageLast30Measured, formatAverage, metricTone } from "./health-metric-utils";
import { MetricTrendCard } from "./metric-trend-card";
import styles from "./activity-redesign.module.css";

const points = (days: HealthMetricDay[], key: keyof HealthMetricDay) => days.map((day) => ({ date: day.metric_date, value: typeof day[key] === "number" ? day[key] as number : null }));
const number = (value: number | null) => value === null ? "—" : Math.round(value).toLocaleString("fr-FR");

function average(values: Array<number | null | undefined>) {
  const present = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}
function averageScores(scores: ScoreDay[], kind: ScoreDay["kind"], endDate: string | undefined) {
  if (!endDate) return null;
  const end = new Date(`${endDate}T12:00:00.000Z`);
  if (!Number.isFinite(end.getTime())) return null;
  end.setUTCDate(end.getUTCDate() - 29);
  const startDate = end.toISOString().slice(0, 10);
  return average(scores.filter((item) => item.kind === kind && item.score_date >= startDate && item.score_date <= endDate).map((item) => item.score));
}

export function ActivityDetails({ data }: { data: HealthAnalytics }) {
  const currentDate = new Intl.DateTimeFormat("en-CA", { timeZone: data.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const activityDays = completedActivityDays(data.days, currentDate);
  const latest = activityDays.at(-1);
  const effortScores = data.scores.filter((item) => item.kind === "effort");
  const latestEffort = latest ? effortScores.findLast((item) => item.score_date === latest.metric_date) : effortScores.at(-1);
  const score = latestEffort?.score ?? null;
  const regularity = activityRegularity(activityDays.slice(-28).map((day) => ({ steps: day.steps, activeZoneMinutes: day.zone_minutes, activeMinutes: day.active_minutes, effortScore: effortScores.find((scoreDay) => scoreDay.score_date === day.metric_date)?.score ?? null })));
  const averages = {
    steps: latest ? averageLast30Measured(activityDays, "steps", latest.metric_date) : null,
    activeCalories: latest ? averageLast30Measured(activityDays, "active_energy_kcal", latest.metric_date) : null,
    dailyLoad: averageScores(effortScores, "effort", latest?.metric_date),
    weeklyLoad: latest ? averageLast30Measured(activityDays, "weekly_load", latest.metric_date) : null,
    acuteChronicLoadRatio: latest ? averageLast30Measured(activityDays, "acute_chronic_load_ratio", latest.metric_date) : null,
    activityRegularity: latest ? averageLast30Measured(activityDays, "activity_consistency_28d", latest.metric_date) : null,
  };
  const tones = {
    steps: metricTone(latest?.steps ?? null, averages.steps, "higher_is_better"),
    activeCalories: metricTone(latest?.active_energy_kcal ?? null, averages.activeCalories, "higher_is_better"),
    dailyLoad: metricTone(score, averages.dailyLoad, "higher_is_better"),
    weeklyLoad: metricTone(latest?.weekly_load ?? null, averages.weeklyLoad, "higher_is_better"),
    activityRegularity: metricTone(regularity.consistencyScore, averages.activityRegularity, "higher_is_better"),
  };
  const latestExercise = data.exercises.at(0);
  const activityMeasurements = latest ? ["steps", "active-zone-minutes", "active-energy-burned", "exercise"].map((type) => latest.source_freshness?.byType?.[type]).filter((value): value is string => Boolean(value)).sort() : [];
  const driverCoverage = Number(latestEffort?.drivers?.coverage);
  const freshness = calculateSignalFreshness({ measuredAt: activityMeasurements.at(-1) ?? latest?.source_freshness?.latestMeasuredAt ?? latest?.metric_date, importedAt: data.importedAt, coverage: Number.isFinite(driverCoverage) ? driverCoverage : score === null ? 0 : 1 });
  const heroMetrics = latest ? <>
    <div className={`health-hero-stat metric-tone--${tones.activeCalories}`}><span>Calories actives</span><AnimatedMetricReading value={latest.active_energy_kcal} format="number" decimals={0} unit={latest.active_energy_kcal === null ? undefined : "kcal"} className={`metric-reading--${tones.activeCalories}`} /><small className="health-hero-stat__average">Moy. 30 j · {formatAverage(averages.activeCalories, "number")} kcal</small></div>
    <div className="health-hero-stat metric-tone--neutral"><span>Minutes en zone</span><AnimatedMetricReading value={latest.zone_minutes} format="number" decimals={0} unit={latest.zone_minutes === null ? undefined : "min"} className="metric-reading--neutral" /><small className="health-hero-stat__average">Dernier jour complet</small></div>
    <div className={`health-hero-stat metric-tone--${tones.weeklyLoad}`}><span>Charge hebdomadaire</span><AnimatedMetricReading value={latest.weekly_load} format="number" decimals={0} className={`metric-reading--${tones.weeklyLoad}`} /><small className="health-hero-stat__average">Moy. 30 j · {formatAverage(averages.weeklyLoad, "number")}</small></div>
  </> : undefined;
  const recentEffortScores = activityDays.slice(-5).map((day) => data.scores.findLast((item) => item.kind === "effort" && item.score_date === day.metric_date)?.score ?? null);
  return <div className={styles.root}><HealthPageShell kind="activity" title="Effort" description="Mouvement, charge d’entraînement et jours actifs." score={score} freshness={freshness} timezone={data.timezone} heroScore={<HealthHeroScore label="Score d’effort" value={score} average={averages.dailyLoad} values={recentEffortScores} tone={tones.dailyLoad} action={<ActivityScorePopover score={score} zoneMinutes={latest?.zone_minutes ?? null} exerciseMinutes={latest?.exercise_minutes ?? null} activeEnergyKcal={latest?.active_energy_kcal ?? null} steps={latest?.steps ?? null} />} />} heroMetrics={heroMetrics}>
    {latest ? <>
      <section className="health-primary-grid" aria-label="Résumé de l’activité récente">
        <article className={`health-primary-card health-primary-card--featured health-primary-card--centered metric-tone--${tones.steps}`}><span>Pas</span><AnimatedMetricReading value={latest.steps} format="number" decimals={0} className={`metric-reading--${tones.steps}`} /><p className="health-primary-card__average">Moyenne sur 30 jours · {formatAverage(averages.steps, "number")}</p></article>
        <article className={`health-primary-card health-primary-card--centered metric-tone--${tones.activeCalories}`}><span>Calories actives</span><AnimatedMetricReading value={latest.active_energy_kcal} format="number" decimals={0} unit={latest.active_energy_kcal === null ? undefined : "kcal"} className={`metric-reading--${tones.activeCalories}`} /><p className="health-primary-card__average">Moyenne sur 30 jours · {formatAverage(averages.activeCalories, "number")} kcal</p></article>
        <article className={`health-primary-card health-primary-card--centered metric-tone--${tones.dailyLoad}`}><span>Charge du jour</span><AnimatedMetricReading value={score} format="number" decimals={0} unit={score === null ? undefined : "/100"} className={`metric-reading--${tones.dailyLoad}`} /><p className="health-primary-card__average">Moyenne sur 30 jours · {formatAverage(averages.dailyLoad, "number")}</p></article>
        <article className={`health-primary-card health-primary-card--centered metric-tone--${tones.weeklyLoad}`}><span>Charge hebdomadaire</span><AnimatedMetricReading value={latest.weekly_load} format="number" decimals={0} className={`metric-reading--${tones.weeklyLoad}`} /><p className="health-primary-card__average">Moyenne sur 30 jours · {formatAverage(averages.weeklyLoad, "number")}</p></article>
        <article className="health-primary-card health-primary-card--centered"><span>Charge récente / habituelle</span><AnimatedMetricReading value={latest.acute_chronic_load_ratio} format="decimal" decimals={2} unit={latest.acute_chronic_load_ratio === null ? undefined : "×"} /><p className="health-primary-card__average">Moyenne sur 30 jours · {formatAverage(averages.acuteChronicLoadRatio, "decimal", 2)}×</p></article>
        <ActivityRegularityCard value={regularity.consistencyScore} average={formatAverage(averages.activityRegularity, "number")} tone={tones.activityRegularity} observedDays={regularity.observedDays} />
      </section>

      <section className="health-panel"><div className="health-section-heading"><div><span className="eyebrow">Dernier jour complet</span><h2>Répartition des zones cardiaques</h2></div><span className="quality-pill">{number(latest.zone_minutes)} min au total</span></div><ZoneDistribution zones={[
        { label: "Légère", minutes: latest.light_zone_minutes, tone: "light" }, { label: "Modérée", minutes: latest.moderate_zone_minutes, tone: "moderate" }, { label: "Vigoureuse", minutes: latest.vigorous_zone_minutes, tone: "vigorous" }, { label: "Pic", minutes: latest.peak_zone_minutes, tone: "peak" },
      ]} /></section>

      <section className="health-trends-block" aria-labelledby="activity-trends-heading"><div className="health-section-heading"><div><span className="eyebrow">30 derniers jours</span><h2 id="activity-trends-heading">Tendances d’activité</h2></div></div><div className="metric-trend-grid">
        <MetricTrendCard label="Pas" points={points(activityDays, "steps")} direction="higher_is_better" format={(value) => Math.round(value).toLocaleString("fr-FR")} animateCurrent animationFormat="number" />
        <MetricTrendCard label="Calories actives" points={points(activityDays, "active_energy_kcal")} unit="kcal" direction="context_only" animateCurrent animationFormat="number" />
        <MetricTrendCard label="Minutes en zone" points={points(activityDays, "zone_minutes")} unit="min" direction="context_only" animateCurrent animationFormat="number" />
        <MetricTrendCard label="Durée d’exercice" points={points(activityDays, "exercise_minutes")} unit="min" direction="context_only" animateCurrent animationFormat="number" />
        <MetricTrendCard label="Distance" points={points(activityDays, "distance_km")} unit="km" direction="context_only" animateCurrent animationFormat="decimal" />
        <MetricTrendCard label="Temps sédentaire" points={points(activityDays, "sedentary_minutes")} unit="min" direction="lower_is_better" animateCurrent animationFormat="number" />
      </div><details className="health-more-metrics"><summary>Voir les métriques complémentaires</summary><div className="metric-trend-grid">
          <MetricTrendCard label="Minutes actives" points={points(activityDays, "active_minutes")} unit="min" direction="higher_is_better" animateCurrent animationFormat="number" />
          <MetricTrendCard label="Énergie totale" points={points(activityDays, "total_energy_kcal")} unit="kcal" direction="context_only" animateCurrent animationFormat="number" />
          <MetricTrendCard label="Étages" points={points(activityDays, "floors")} direction="higher_is_better" animateCurrent animationFormat="number" />
          <MetricTrendCard label="Dénivelé" points={points(activityDays, "altitude_gain_m")} unit="m" direction="context_only" animateCurrent animationFormat="number" />
          <MetricTrendCard label="Poids" points={points(activityDays, "weight_kg")} unit="kg" direction="context_only" animateCurrent animationFormat="decimal" />
          <MetricTrendCard label="Masse grasse" points={points(activityDays, "body_fat_percent")} unit="%" direction="context_only" animateCurrent animationFormat="decimal" />
        </div></details></section>

      {latestExercise && <section className="health-panel"><div className="health-section-heading"><div><span className="eyebrow">Dernière séance</span><h2>{latestExercise.name}</h2></div><span className="quality-pill">{latestExercise.type.replaceAll("_", " ")}</span></div><dl className="exercise-detail-grid">
        <div><dt>Temps actif</dt><dd>{latestExercise.activeMinutes === null ? "—" : `${Math.round(latestExercise.activeMinutes)} min`}</dd></div>
        <div><dt>Vitesse</dt><dd>{latestExercise.averageSpeedKph === null ? "—" : `${latestExercise.averageSpeedKph.toFixed(1)} km/h`}</dd></div>
        <div><dt>Allure</dt><dd>{latestExercise.averagePaceSecondsPerKm === null ? "—" : `${Math.floor(latestExercise.averagePaceSecondsPerKm / 60)}:${Math.round(latestExercise.averagePaceSecondsPerKm % 60).toString().padStart(2, "0")} /km`}</dd></div>
        <div><dt>Dénivelé</dt><dd>{latestExercise.elevationGainMeters === null ? "—" : `${Math.round(latestExercise.elevationGainMeters)} m`}</dd></div>
        <div><dt>Pas</dt><dd>{number(latestExercise.steps)}</dd></div>
        <div><dt>Run VO₂ max</dt><dd>{latestExercise.runVo2Max === null ? "—" : latestExercise.runVo2Max.toFixed(1)}</dd></div>
        <div><dt>Cadence</dt><dd>{latestExercise.cadence === null ? "—" : `${Math.round(latestExercise.cadence)} spm`}</dd></div>
        <div><dt>Stride</dt><dd>{latestExercise.strideLengthMeters === null ? "—" : `${latestExercise.strideLengthMeters.toFixed(2)} m`}</dd></div>
        <div><dt>Ground contact</dt><dd>{latestExercise.groundContactMilliseconds === null ? "—" : `${Math.round(latestExercise.groundContactMilliseconds)} ms`}</dd></div>
        <div><dt>Vertical oscillation</dt><dd>{latestExercise.verticalOscillationMillimeters === null ? "—" : `${Math.round(latestExercise.verticalOscillationMillimeters)} mm`}</dd></div>
        <div><dt>Vertical ratio</dt><dd>{latestExercise.verticalRatio === null ? "—" : `${latestExercise.verticalRatio.toFixed(1)}%`}</dd></div>
        <div><dt>Swim lengths</dt><dd>{number(latestExercise.swimLengths)}</dd></div>
      </dl></section>}

      <section className="health-panel"><div className="health-section-heading"><div><span className="eyebrow">Google Health exercises</span><h2>Recent sessions</h2></div><span className="quality-pill">{data.exercises.length} sessions</span></div>{data.exercises.length ? <div className="exercise-table-wrap" role="region" aria-label="Recent exercise sessions, horizontally scrollable" tabIndex={0}><table className="exercise-table"><thead><tr><th>Session</th><th>Date</th><th>Duration</th><th>Calories</th><th>Distance</th><th>Avg HR</th><th>Zone min</th></tr></thead><tbody>{data.exercises.map((exercise) => <tr key={exercise.id}><th scope="row"><Footprints size={16} aria-hidden="true" />{exercise.name}<small>{exercise.type.replaceAll("_", " ")}</small></th><td>{exercise.date}</td><td>{exercise.durationMinutes === null ? "—" : `${Math.round(exercise.durationMinutes)} min`}</td><td>{exercise.calories === null ? "—" : `${Math.round(exercise.calories)} kcal`}</td><td>{exercise.distanceKm === null ? "—" : `${exercise.distanceKm.toFixed(2)} km`}</td><td>{exercise.averageHeartRate === null ? "—" : `${Math.round(exercise.averageHeartRate)} bpm`}</td><td>{exercise.zoneMinutes === null ? "—" : Math.round(exercise.zoneMinutes)}</td></tr>)}</tbody></table></div> : <p className="health-empty">No Google Health exercises are available yet.</p>}</section>
    </> : <section className="health-panel health-empty"><Footprints size={24} aria-hidden="true" /><div><h2>No activity data yet</h2><p>Sync one measured activity day to begin.</p></div></section>}
  </HealthPageShell></div>;
}
