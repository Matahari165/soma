"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ExerciseSummary } from "@/services/health-analytics";

import styles from "./activity-redesign.module.css";

type ActivityFilter = "all" | "run" | "boxing" | "hiking" | "walking" | "strength";
type ActivityPeriod = 7 | 14 | 30 | 60 | 90 | 180;

const filters: { id: ActivityFilter; label: string; types: readonly string[] }[] = [
  { id: "all", label: "All", types: [] },
  { id: "run", label: "Running", types: ["RUNNING", "JOGGING", "TRAIL_RUNNING"] },
  { id: "boxing", label: "Boxing", types: ["BOXING", "BOXE"] },
  { id: "hiking", label: "Hiking", types: ["HIKING"] },
  { id: "walking", label: "Walking", types: ["WALKING"] },
  { id: "strength", label: "Strength", types: ["WEIGHT_TRAINING", "STRENGTH_TRAINING"] },
];

const periods: { days: ActivityPeriod; label: string }[] = [
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 30, label: "1 month" },
  { days: 60, label: "2 months" },
  { days: 90, label: "3 months" },
  { days: 180, label: "6 months" },
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
    : "Unavailable";
}

function sessionDuration(minutes: number | null) {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return "Unavailable";
  return `${Math.round(minutes)} min`;
}

function pace(exercise: ExerciseSummary) {
  const seconds = exercise.averagePaceSecondsPerKm;
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return "Unavailable";
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")} min/km`;
}

function average(values: Array<number | null | undefined>) {
  const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

export function activityAverages(exercises: ExerciseSummary[]) {
  return {
    distanceKm: average(exercises.map((exercise) => exercise.distanceKm)),
    durationMinutes: average(exercises.map((exercise) => exercise.durationMinutes).filter((value) => value === null || value >= 0)),
    averagePaceSecondsPerKm: average(exercises.map((exercise) => exercise.averagePaceSecondsPerKm)),
    averageHeartRate: average(exercises.map((exercise) => exercise.averageHeartRate)),
    maximumHeartRate: average(exercises.map((exercise) => exercise.maximumHeartRate)),
    calories: average(exercises.map((exercise) => exercise.calories)),
  };
}

export function displayedActivities(exercises: ExerciseSummary[], filtersWereUsed: boolean) {
  const newestFirst = [...exercises].sort((left, right) => right.date.localeCompare(left.date));
  return filtersWereUsed ? newestFirst : newestFirst.slice(0, 3);
}

function paceValue(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return "Unavailable";
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")} min/km`;
}

export function exerciseIsInPeriod(date: string, referenceDate: string, days: ActivityPeriod): boolean {
  const end = new Date(`${referenceDate}T12:00:00.000Z`);
  const value = new Date(`${date}T12:00:00.000Z`);
  if (!Number.isFinite(end.getTime()) || !Number.isFinite(value.getTime())) return false;
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return value >= start && value <= end;
}

export function ActivityHistory({ exercises, referenceDate }: { exercises: ExerciseSummary[]; referenceDate: string }) {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [period, setPeriod] = useState<ActivityPeriod>(30);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [filtersWereUsed, setFiltersWereUsed] = useState(false);
  const periodPickerRef = useRef<HTMLDivElement>(null);
  const visible = exercises.filter((exercise) => exerciseMatchesFilter(exercise.type, filter) && exerciseIsInPeriod(exercise.date, referenceDate, period));
  const displayed = displayedActivities(visible, filtersWereUsed);
  const averages = useMemo(() => activityAverages(displayed), [displayed]);
  const periodLabel = periods.find((item) => item.days === period)?.label ?? "Period";

  useEffect(() => {
    if (!periodOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!periodPickerRef.current?.contains(event.target as Node)) setPeriodOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPeriodOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [periodOpen]);

  return <section className={`${styles.section} health-observatory-panel`} aria-labelledby="activity-sessions-heading">
    <header className={styles.sectionHeader}>
      <h2 id="activity-sessions-heading">Workout history</h2>
    </header>
    <div className={styles.activityFilterGroups}>
      <div className={styles.activityFilters} role="group" aria-label="Filter workouts by activity">
      {filters.map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => { setFilter(item.id); setFiltersWereUsed(true); }}>{item.label}</button>)}
      </div>
      <div className={styles.periodPicker} ref={periodPickerRef}>
        <button className={styles.periodTrigger} type="button" aria-expanded={periodOpen} aria-controls="activity-period-options" onClick={() => setPeriodOpen((open) => !open)}><SlidersHorizontal size={15} aria-hidden="true" /><span>Period · {periodLabel}</span><ChevronDown size={14} aria-hidden="true" /></button>
        <div className={styles.periodPanel} data-open={periodOpen ? "true" : "false"} id="activity-period-options">
          <div className={styles.periodOptions} role="group" aria-label="Filter workouts by period">
            {periods.map((item) => <button key={item.days} type="button" aria-pressed={period === item.days} onClick={() => { setPeriod(item.days); setFiltersWereUsed(true); setPeriodOpen(false); }}>{item.label}</button>)}
          </div>
        </div>
      </div>
    </div>
    {displayed.length ? <>
      <div className={`${styles.activityHistoryRow} ${styles.activityAverageRow}`} role="group" aria-label="Average for displayed workouts">
        <div className={styles.activityHistoryIdentity}><strong>Average</strong><span>{filtersWereUsed ? `${periodLabel} · current filters` : displayed.length}</span></div>
        <dl className={styles.activityHistoryMetrics}>
          <div><dt>Distance</dt><dd>{metric(averages.distanceKm, "km", 2)}</dd></div>
          <div><dt>Duration</dt><dd>{sessionDuration(averages.durationMinutes)}</dd></div>
          <div><dt>Pace</dt><dd>{paceValue(averages.averagePaceSecondsPerKm)}</dd></div>
          <div><dt>Avg HR</dt><dd>{metric(averages.averageHeartRate, "bpm")}</dd></div>
          <div><dt>Max HR</dt><dd>{metric(averages.maximumHeartRate, "bpm")}</dd></div>
          <div><dt>Estimated calories</dt><dd>{metric(averages.calories, "kcal")}</dd></div>
        </dl>
      </div>
      <ol className={styles.activityHistory}>
      {displayed.map((exercise) => <li key={exercise.id} className={styles.activityHistoryRow}>
        <div className={styles.activityHistoryIdentity}>
          <strong>{exercise.name}</strong>
          <span>{exercise.date} · {activityLabel(exercise.type)}</span>
        </div>
        <dl className={styles.activityHistoryMetrics}>
          <div><dt>Distance</dt><dd>{metric(exercise.distanceKm, "km", 2)}</dd></div>
          <div><dt>Duration</dt><dd>{sessionDuration(exercise.durationMinutes)}</dd></div>
          <div><dt>Pace</dt><dd>{pace(exercise)}</dd></div>
          <div><dt>Avg HR</dt><dd>{metric(exercise.averageHeartRate, "bpm")}</dd></div>
          <div><dt>Max HR</dt><dd>{metric(exercise.maximumHeartRate ?? null, "bpm")}</dd></div>
          <div><dt>Estimated calories</dt><dd>{metric(exercise.calories, "kcal")}</dd></div>
        </dl>
      </li>)}
      </ol>
    </> : <p className={styles.activityHistoryEmpty}>No imported workouts match these filters.</p>}
  </section>;
}
