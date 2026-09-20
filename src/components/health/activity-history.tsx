"use client";

import { useState } from "react";

import type { ExerciseSummary } from "@/services/health-analytics";

import styles from "./activity-redesign.module.css";

type ActivityFilter = "all" | "run" | "boxing" | "hiking" | "walking" | "strength";

const filters: { id: ActivityFilter; label: string; types: readonly string[] }[] = [
  { id: "all", label: "Toutes", types: [] },
  { id: "run", label: "Run", types: ["RUNNING", "JOGGING", "TRAIL_RUNNING"] },
  { id: "boxing", label: "Boxe", types: ["BOXING", "BOXE"] },
  { id: "hiking", label: "Randonnée", types: ["HIKING"] },
  { id: "walking", label: "Marche", types: ["WALKING"] },
  { id: "strength", label: "Musculation", types: ["WEIGHT_TRAINING", "STRENGTH_TRAINING"] },
];

export function exerciseMatchesFilter(type: string, filter: ActivityFilter): boolean {
  if (filter === "all") return true;
  const normalized = type.trim().replaceAll("-", "_").toUpperCase();
  return filters.find((item) => item.id === filter)?.types.includes(normalized) ?? false;
}

function activityLabel(type: string) {
  const normalized = type.trim().replaceAll("-", "_").toUpperCase();
  return filters.find((item) => item.id !== "all" && item.types.includes(normalized))?.label
    ?? normalized.replaceAll("_", " ").toLowerCase();
}

function metric(value: number | null, unit: string, digits = 0) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${unit}`
    : "Indisponible";
}

function pace(exercise: ExerciseSummary) {
  const seconds = exercise.averagePaceSecondsPerKm;
  if (seconds === null || !Number.isFinite(seconds)) return metric(exercise.averageSpeedKph, "km/h", 1);
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")} min/km`;
}

export function ActivityHistory({ exercises }: { exercises: ExerciseSummary[] }) {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const visible = exercises.filter((exercise) => exerciseMatchesFilter(exercise.type, filter));

  return <section className={`${styles.section} health-observatory-panel`} aria-labelledby="activity-sessions-heading">
    <header className={styles.sectionHeader}>
      <h2 id="activity-sessions-heading">Historique des activités</h2>
      <span>{visible.length} séance{visible.length === 1 ? "" : "s"}</span>
    </header>
    <div className={styles.activityFilters} role="group" aria-label="Filtrer les séances par activité">
      {filters.map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}
    </div>
    {visible.length ? <ol className={styles.activityHistory}>
      {visible.map((exercise) => <li key={exercise.id} className={styles.activityHistoryRow}>
        <div className={styles.activityHistoryIdentity}>
          <strong>{exercise.name}</strong>
          <span>{exercise.date} · {activityLabel(exercise.type)}</span>
        </div>
        <dl className={styles.activityHistoryMetrics}>
          <div><dt>Distance</dt><dd>{metric(exercise.distanceKm, "km", 2)}</dd></div>
          <div><dt>Temps total</dt><dd>{metric(exercise.durationMinutes, "min")}</dd></div>
          <div><dt>Temps actif</dt><dd>{metric(exercise.activeMinutes, "min")}</dd></div>
          <div><dt>Vitesse</dt><dd>{metric(exercise.averageSpeedKph, "km/h", 1)}</dd></div>
          <div><dt>Allure / vitesse</dt><dd>{pace(exercise)}</dd></div>
          <div><dt>FC moyenne</dt><dd>{metric(exercise.averageHeartRate, "bpm")}</dd></div>
          <div><dt>Calories estimées</dt><dd>{metric(exercise.calories, "kcal")}</dd></div>
        </dl>
      </li>)}
    </ol> : <p className={styles.activityHistoryEmpty}>Aucune séance importée pour ce filtre.</p>}
  </section>;
}
