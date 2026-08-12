import { Footprints } from "lucide-react";

import { activityRegularity, completedActivityDays } from "@/domain/metrics/wellness";
import type { HealthAnalytics, HealthMetricDay } from "@/services/health-analytics";

import { HealthPageShell } from "./health-page-shell";
import { ZoneDistribution } from "./health-charts";
import { MetricTrendCard } from "./metric-trend-card";

const points = (days: HealthMetricDay[], key: keyof HealthMetricDay) => days.map((day) => ({ date: day.metric_date, value: typeof day[key] === "number" ? day[key] as number : null }));
const number = (value: number | null) => value === null ? "—" : Math.round(value).toLocaleString("en-US");

export function ActivityDetails({ data }: { data: HealthAnalytics }) {
  const currentDate = new Intl.DateTimeFormat("en-CA", { timeZone: data.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const activityDays = completedActivityDays(data.days, currentDate);
  const latest = activityDays.at(-1);
  const effortScores = data.scores.filter((item) => item.kind === "effort");
  const latestEffort = effortScores.findLast((item) => item.score_date === latest?.metric_date);
  const score = latestEffort?.score ?? null;
  const regularity = activityRegularity(activityDays.slice(-28).map((day) => ({ steps: day.steps, activeZoneMinutes: day.zone_minutes, activeMinutes: day.active_minutes, effortScore: effortScores.find((scoreDay) => scoreDay.score_date === day.metric_date)?.score ?? null })));
  const latestExercise = data.exercises.at(0);
  return <HealthPageShell kind="activity" title="Activity" description="Movement, training load, and active days." score={score}>
    {latest ? <>
      <section className="health-primary-grid" aria-label="Latest activity summary">
        <article className="health-primary-card health-primary-card--featured"><span>Steps</span><strong>{number(latest.steps)}</strong><p>{regularity.activeDays} active and {regularity.inactiveDays} inactive measured days in the latest 28.</p></article>
        <article className="health-primary-card"><span>Active calories</span><strong>{latest.active_energy_kcal === null ? "—" : `${number(latest.active_energy_kcal)} kcal`}</strong></article>
        <article className="health-primary-card"><span>Daily load</span><strong>{score ?? "—"}</strong></article>
        <article className="health-primary-card"><span>Weekly load</span><strong>{number(latest.weekly_load)}</strong></article>
        <article className="health-primary-card"><span>Recent / habitual</span><strong>{latest.acute_chronic_load_ratio === null ? "—" : `${latest.acute_chronic_load_ratio.toFixed(2)}×`}</strong></article>
        <article className="health-primary-card"><span>Activity regularity</span><strong>{regularity.consistencyScore === null ? "—" : `${regularity.consistencyScore}%`}</strong><p>{regularity.activeDayRate === null ? "Baseline pending." : `${regularity.activeDayRate}% of measured days were active.`}</p></article>
      </section>

      <section className="health-panel"><div className="health-section-heading"><div><span className="eyebrow">Latest complete day</span><h2>Heart-rate-zone balance</h2></div><span className="quality-pill">{number(latest.zone_minutes)} total min</span></div><ZoneDistribution zones={[
        { label: "Light", minutes: latest.light_zone_minutes, tone: "light" }, { label: "Moderate", minutes: latest.moderate_zone_minutes, tone: "moderate" }, { label: "Vigorous", minutes: latest.vigorous_zone_minutes, tone: "vigorous" }, { label: "Peak", minutes: latest.peak_zone_minutes, tone: "peak" },
      ]} /></section>

      <section className="metric-trend-grid" aria-label="Activity trends">
        <MetricTrendCard label="Steps" points={points(activityDays, "steps")} direction="higher_is_better" format={(value) => Math.round(value).toLocaleString("en-US")} />
        <MetricTrendCard label="Active calories" points={points(activityDays, "active_energy_kcal")} unit="kcal" direction="context_only" />
        <MetricTrendCard label="Zone minutes" points={points(activityDays, "zone_minutes")} unit="min" direction="context_only" />
        <MetricTrendCard label="Exercise duration" points={points(activityDays, "exercise_minutes")} unit="min" direction="context_only" />
        <MetricTrendCard label="Distance" points={points(activityDays, "distance_km")} unit="km" direction="context_only" />
        <MetricTrendCard label="Sedentary time" points={points(activityDays, "sedentary_minutes")} unit="min" direction="lower_is_better" />
        <MetricTrendCard label="Active minutes" points={points(activityDays, "active_minutes")} unit="min" direction="higher_is_better" />
        <MetricTrendCard label="Total energy" points={points(activityDays, "total_energy_kcal")} unit="kcal" direction="context_only" />
        <MetricTrendCard label="Floors" points={points(activityDays, "floors")} direction="higher_is_better" />
        <MetricTrendCard label="Elevation gain" points={points(activityDays, "altitude_gain_m")} unit="m" direction="context_only" />
        <MetricTrendCard label="Weight" points={points(activityDays, "weight_kg")} unit="kg" direction="context_only" />
        <MetricTrendCard label="Body fat" points={points(activityDays, "body_fat_percent")} unit="%" direction="context_only" />
      </section>

      <section className="health-panel"><div className="health-section-heading"><div><span className="eyebrow">Google Health exercises</span><h2>Recent sessions</h2></div><span className="quality-pill">{data.exercises.length} sessions</span></div>{data.exercises.length ? <div className="exercise-table-wrap" role="region" aria-label="Recent exercise sessions, horizontally scrollable" tabIndex={0}><table className="exercise-table"><thead><tr><th>Session</th><th>Date</th><th>Duration</th><th>Calories</th><th>Distance</th><th>Avg HR</th><th>Zone min</th></tr></thead><tbody>{data.exercises.map((exercise) => <tr key={exercise.id}><th scope="row"><Footprints size={16} aria-hidden="true" />{exercise.name}<small>{exercise.type.replaceAll("_", " ")}</small></th><td>{exercise.date}</td><td>{exercise.durationMinutes === null ? "—" : `${Math.round(exercise.durationMinutes)} min`}</td><td>{exercise.calories === null ? "—" : `${Math.round(exercise.calories)} kcal`}</td><td>{exercise.distanceKm === null ? "—" : `${exercise.distanceKm.toFixed(2)} km`}</td><td>{exercise.averageHeartRate === null ? "—" : `${Math.round(exercise.averageHeartRate)} bpm`}</td><td>{exercise.zoneMinutes === null ? "—" : Math.round(exercise.zoneMinutes)}</td></tr>)}</tbody></table></div> : <p className="health-empty">No Google Health exercises are available yet.</p>}</section>
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
    </> : <section className="health-panel health-empty"><Footprints size={24} aria-hidden="true" /><div><h2>No activity data yet</h2><p>Sync one measured activity day to begin.</p></div></section>}
  </HealthPageShell>;
}
