import { Footprints } from "lucide-react";

import { calculateSignalFreshness } from "@/domain/health/freshness";
import { activityRegularity, completedActivityDays } from "@/domain/metrics/wellness";
import type { HealthAnalytics, HealthMetricDay, ScoreDay } from "@/services/health-analytics";

import { HealthPageShell } from "./health-page-shell";
import { ZoneDistribution } from "./health-charts";
import { ActivityRegularityCard, ActivityScorePopover } from "./activity-explanation-popover";
import { AnimatedMetricReading } from "./animated-value";
import { averageLast30Measured, formatAverage, metricTone } from "./health-metric-utils";
import { MetricTrendCard } from "./metric-trend-card";

const points = (days: HealthMetricDay[], key: keyof HealthMetricDay) => days.map((day) => ({ date: day.metric_date, value: typeof day[key] === "number" ? day[key] as number : null }));
const number = (value: number | null) => value === null ? "—" : Math.round(value).toLocaleString("en-US");

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
  return <HealthPageShell kind="activity" title="Activity" description="Movement, training load, and active days." score={score} freshness={freshness} timezone={data.timezone} heroScore={<ActivityScorePopover score={score} zoneMinutes={latest?.zone_minutes ?? null} exerciseMinutes={latest?.exercise_minutes ?? null} activeEnergyKcal={latest?.active_energy_kcal ?? null} steps={latest?.steps ?? null} />}>
    {latest ? <>
      <section className="health-primary-grid" aria-label="Latest activity summary">
        <article className={`health-primary-card health-primary-card--featured health-primary-card--centered metric-tone--${tones.steps}`}><span>Steps</span><AnimatedMetricReading value={latest.steps} format="number" decimals={0} className={`metric-reading--${tones.steps}`} /><p className="health-primary-card__average">30-day average · {formatAverage(averages.steps, "number")}</p></article>
        <article className={`health-primary-card health-primary-card--centered metric-tone--${tones.activeCalories}`}><span>Active calories</span><AnimatedMetricReading value={latest.active_energy_kcal} format="number" decimals={0} unit={latest.active_energy_kcal === null ? undefined : "kcal"} className={`metric-reading--${tones.activeCalories}`} /><p className="health-primary-card__average">30-day average · {formatAverage(averages.activeCalories, "number")} kcal</p></article>
        <article className={`health-primary-card health-primary-card--centered metric-tone--${tones.dailyLoad}`}><span>Daily load</span><AnimatedMetricReading value={score} format="number" decimals={0} unit={score === null ? undefined : "/100"} className={`metric-reading--${tones.dailyLoad}`} /><p className="health-primary-card__average">30-day average · {formatAverage(averages.dailyLoad, "number")}</p></article>
        <article className={`health-primary-card health-primary-card--centered metric-tone--${tones.weeklyLoad}`}><span>Weekly load</span><AnimatedMetricReading value={latest.weekly_load} format="number" decimals={0} className={`metric-reading--${tones.weeklyLoad}`} /><p className="health-primary-card__average">30-day average · {formatAverage(averages.weeklyLoad, "number")}</p></article>
        <article className="health-primary-card health-primary-card--centered"><span>Recent / habitual</span><AnimatedMetricReading value={latest.acute_chronic_load_ratio} format="decimal" decimals={2} unit={latest.acute_chronic_load_ratio === null ? undefined : "×"} /><p className="health-primary-card__average">30-day average · {formatAverage(averages.acuteChronicLoadRatio, "decimal", 2)}×</p></article>
        <ActivityRegularityCard value={regularity.consistencyScore} average={formatAverage(averages.activityRegularity, "number")} tone={tones.activityRegularity} observedDays={regularity.observedDays} />
      </section>

      <section className="health-panel"><div className="health-section-heading"><div><span className="eyebrow">Latest complete day</span><h2>Heart-rate-zone balance</h2></div><span className="quality-pill">{number(latest.zone_minutes)} total min</span></div><ZoneDistribution zones={[
        { label: "Light", minutes: latest.light_zone_minutes, tone: "light" }, { label: "Moderate", minutes: latest.moderate_zone_minutes, tone: "moderate" }, { label: "Vigorous", minutes: latest.vigorous_zone_minutes, tone: "vigorous" }, { label: "Peak", minutes: latest.peak_zone_minutes, tone: "peak" },
      ]} /></section>

      <section className="health-trends-block" aria-labelledby="activity-trends-heading"><div className="health-section-heading"><div><span className="eyebrow">Last 30 days</span><h2 id="activity-trends-heading">Activity trends</h2></div></div><div className="metric-trend-grid">
        <MetricTrendCard label="Steps" points={points(activityDays, "steps")} direction="higher_is_better" format={(value) => Math.round(value).toLocaleString("en-US")} animateCurrent animationFormat="number" />
        <MetricTrendCard label="Active calories" points={points(activityDays, "active_energy_kcal")} unit="kcal" direction="context_only" animateCurrent animationFormat="number" />
        <MetricTrendCard label="Zone minutes" points={points(activityDays, "zone_minutes")} unit="min" direction="context_only" animateCurrent animationFormat="number" />
        <MetricTrendCard label="Exercise duration" points={points(activityDays, "exercise_minutes")} unit="min" direction="context_only" animateCurrent animationFormat="number" />
        <MetricTrendCard label="Distance" points={points(activityDays, "distance_km")} unit="km" direction="context_only" animateCurrent animationFormat="decimal" />
        <MetricTrendCard label="Sedentary time" points={points(activityDays, "sedentary_minutes")} unit="min" direction="lower_is_better" animateCurrent animationFormat="number" />
      </div><details className="health-more-metrics"><summary>Show supporting metrics</summary><div className="metric-trend-grid">
          <MetricTrendCard label="Active minutes" points={points(activityDays, "active_minutes")} unit="min" direction="higher_is_better" animateCurrent animationFormat="number" />
          <MetricTrendCard label="Total energy" points={points(activityDays, "total_energy_kcal")} unit="kcal" direction="context_only" animateCurrent animationFormat="number" />
          <MetricTrendCard label="Floors" points={points(activityDays, "floors")} direction="higher_is_better" animateCurrent animationFormat="number" />
          <MetricTrendCard label="Elevation gain" points={points(activityDays, "altitude_gain_m")} unit="m" direction="context_only" animateCurrent animationFormat="number" />
          <MetricTrendCard label="Weight" points={points(activityDays, "weight_kg")} unit="kg" direction="context_only" animateCurrent animationFormat="decimal" />
          <MetricTrendCard label="Body fat" points={points(activityDays, "body_fat_percent")} unit="%" direction="context_only" animateCurrent animationFormat="decimal" />
        </div></details></section>

      {latestExercise && <section className="health-panel"><div className="health-section-heading"><div><span className="eyebrow">Latest session detail</span><h2>{latestExercise.name}</h2></div><span className="quality-pill">{latestExercise.type.replaceAll("_", " ")}</span></div><dl className="exercise-detail-grid">
        <div><dt>Active time</dt><dd>{latestExercise.activeMinutes === null ? "—" : `${Math.round(latestExercise.activeMinutes)} min`}</dd></div>
        <div><dt>Speed</dt><dd>{latestExercise.averageSpeedKph === null ? "—" : `${latestExercise.averageSpeedKph.toFixed(1)} km/h`}</dd></div>
        <div><dt>Pace</dt><dd>{latestExercise.averagePaceSecondsPerKm === null ? "—" : `${Math.floor(latestExercise.averagePaceSecondsPerKm / 60)}:${Math.round(latestExercise.averagePaceSecondsPerKm % 60).toString().padStart(2, "0")} /km`}</dd></div>
        <div><dt>Elevation</dt><dd>{latestExercise.elevationGainMeters === null ? "—" : `${Math.round(latestExercise.elevationGainMeters)} m`}</dd></div>
        <div><dt>Steps</dt><dd>{number(latestExercise.steps)}</dd></div>
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
  </HealthPageShell>;
}
