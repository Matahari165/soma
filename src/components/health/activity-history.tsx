"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { ExerciseSummary } from "@/services/health-analytics";

import styles from "./activity-redesign.module.css";

type SessionTelemetry = {
  maxHeartRateBpm: number | null;
  maxHeartRateSource?: "google_health_rollup" | "recorded_samples" | "none";
  heartRateSampleCount: number;
  heartRateSamples: Array<{ measuredAt: string; bpm: number }>;
  heartRateSamplesDownsampled: boolean;
  heartRateFetchLimited: boolean;
  heartRateFetchStatus: "not_needed" | "fetched" | "empty" | "unavailable" | "failed";
  coverage: { sessionSeconds: number; observedSeconds: number; percent: number | null };
  calculatedZones: { seconds: { light: number; moderate: number; vigorous: number; peak: number }; classifiedSeconds: number; observedSeconds: number; thresholdCoveragePercent: number | null; complete: boolean } | null;
};
type EstimatedSplit = { index: number; distanceKm: number; paceSecondsPerKm: number; partial: boolean };

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
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")} min/km`;
}

function minutes(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "Unavailable";
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")} min`;
}

function SessionHeartRate({ samples }: { samples: SessionTelemetry["heartRateSamples"] }) {
  if (samples.length < 2) return null;
  const values = samples.filter((sample) => Number.isFinite(sample.bpm) && Number.isFinite(Date.parse(sample.measuredAt)));
  if (values.length < 2) return null;
  const start = Date.parse(values[0].measuredAt);
  const end = Date.parse(values.at(-1)!.measuredAt);
  const observedMinimum = Math.min(...values.map((sample) => sample.bpm));
  const observedMaximum = Math.max(...values.map((sample) => sample.bpm));
  const minimum = Math.floor(observedMinimum / 10) * 10;
  const maximum = Math.ceil(observedMaximum / 10) * 10;
  const span = Math.max(maximum - minimum, 1);
  const segments: string[][] = [[]];
  values.forEach((sample, index) => {
    if (index > 0 && Date.parse(sample.measuredAt) - Date.parse(values[index - 1].measuredAt) > 15_000) segments.push([]);
    segments.at(-1)!.push(`${end > start ? ((Date.parse(sample.measuredAt) - start) / (end - start)) * 1000 : index / (values.length - 1) * 1000},${120 - ((sample.bpm - minimum) / span) * 112}`);
  });
  return <div className={styles.activityHeartRateGraph}>
    <svg viewBox="0 0 1000 128" preserveAspectRatio="none" role="img" aria-label={`Recorded heart rate across the workout, from ${observedMinimum} to ${observedMaximum} beats per minute. Breaks indicate missing measurements.`}>
      <line x1="0" x2="1000" y1="120" y2="120" />
      {segments.map((points, index) => points.length > 1 ? <polyline key={index} points={points.join(" ")} /> : null)}
    </svg>
    <span className={styles.activityHeartRateUpper}>{observedMaximum}</span>
    <span className={styles.activityHeartRateLower}>{observedMinimum}</span>
    <div><span>{new Date(start).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span><span>{new Date(end).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span></div>
  </div>;
}

function ActivitySession({ exercise }: { exercise: ExerciseSummary }) {
  const rowRef = useRef<HTMLLIElement>(null);
  const detailId = useId();
  const [open, setOpen] = useState(false);
  const [telemetry, setTelemetry] = useState<SessionTelemetry | null>(null);
  const [telemetryState, setTelemetryState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [retryCount, setRetryCount] = useState(0);
  const [estimatedSplits, setEstimatedSplits] = useState<EstimatedSplit[]>([]);
  const [paceState, setPaceState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  useEffect(() => {
    if (!exercise.startTime || !exercise.endTime || !rowRef.current) return;
    const controller = new AbortController();
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      setTelemetryState("loading");
      fetch(`/api/health/activity-session?record=${encodeURIComponent(exercise.id)}`, { signal: controller.signal, cache: "no-store" })
        .then((response) => { if (!response.ok) throw new Error("Session telemetry unavailable"); return response.json() as Promise<SessionTelemetry>; })
        .then((result) => { setTelemetry(result); setTelemetryState("ready"); })
        .catch(() => { if (!controller.signal.aborted) setTelemetryState("error"); });
    }, { rootMargin: "300px 0px" });
    observer.observe(rowRef.current);
    return () => { observer.disconnect(); controller.abort(); };
  }, [exercise.id, exercise.startTime, exercise.endTime, retryCount]);
  const loadPace = () => {
    if (exercise.splits?.length || !exercise.startTime || !exercise.endTime || paceState !== "idle") return;
    setPaceState("loading");
    fetch(`/api/health/activity-session-pace?record=${encodeURIComponent(exercise.id)}`, { cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error("Session pace unavailable"); return response.json() as Promise<{ splits: EstimatedSplit[] }>; })
      .then((result) => { setEstimatedSplits(result.splits); setPaceState("ready"); })
      .catch(() => setPaceState("error"));
  };
  const reportedZones = exercise.heartRateZones;
  const hasReportedZones = reportedZones && Object.values(reportedZones).some((value) => typeof value === "number" && Number.isFinite(value));
  const calculatedZones = telemetry?.calculatedZones;
  const zones = hasReportedZones
    ? [reportedZones.lightMinutes, reportedZones.moderateMinutes, reportedZones.vigorousMinutes, reportedZones.peakMinutes].map((value) => value === null ? null : value * 60)
    : calculatedZones ? [calculatedZones.seconds.light, calculatedZones.seconds.moderate, calculatedZones.seconds.vigorous, calculatedZones.seconds.peak] : null;
  const maxHeartRate = telemetry?.maxHeartRateBpm ?? exercise.maximumHeartRate ?? null;
  const maxHeartRateText = maxHeartRate === null && telemetryState === "loading" ? "Loading…" : `${telemetry?.heartRateFetchLimited && telemetry.maxHeartRateSource !== "google_health_rollup" && maxHeartRate !== null ? "≥" : ""}${metric(maxHeartRate, "bpm")}`;
  return <li ref={rowRef} className={styles.activitySession}>
      <div className={styles.activityHistoryRow}>
        <div className={styles.activityHistoryIdentity}><button type="button" aria-expanded={open} aria-controls={detailId} onClick={() => { if (!open) loadPace(); setOpen((value) => !value); }} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}><strong>{exercise.name}</strong><span className={styles.activityDetailPrompt}>Workout details <ChevronDown size={14} aria-hidden="true" /></span></button><span>{exercise.date} · {activityLabel(exercise.type)}</span></div>
        <dl className={styles.activityHistoryMetrics}>
          <div><dt>Distance</dt><dd>{metric(exercise.distanceKm, "km", 2)}</dd></div>
          <div><dt>Duration</dt><dd>{sessionDuration(exercise.durationMinutes)}</dd></div>
          <div><dt>Pace</dt><dd>{pace(exercise)}</dd></div>
          <div><dt>Avg HR</dt><dd>{metric(exercise.averageHeartRate, "bpm")}</dd></div>
          <div><dt>Max HR</dt><dd>{maxHeartRateText}</dd></div>
          <div><dt>Estimated calories</dt><dd>{metric(exercise.calories, "kcal")}</dd></div>
        </dl>
      </div>
      <div id={detailId} className={styles.activitySessionDetails} hidden={!open}>
        <div className={styles.activityDetailSection}>
          <h3>Pace by split</h3>
          {exercise.splits?.length ? <ol className={styles.activitySplits}>{exercise.splits.map((split, index) => <li key={`${split.startTime ?? index}-${index}`}><span>{split.distanceKm !== null && Math.abs(split.distanceKm - 1) < 0.05 ? `Kilometer ${index + 1}` : `Split ${index + 1}`}</span><span>{metric(split.distanceKm, "km", 2)}</span><strong>{paceValue(split.averagePaceSecondsPerKm)}</strong></li>)}</ol> : estimatedSplits.length ? <><ol className={styles.activitySplits}>{estimatedSplits.map((split) => <li key={split.index}><span>{split.partial ? `Final segment` : `Kilometer ${split.index}`}</span><span>{metric(split.distanceKm, "km", 2)}</span><strong>{paceValue(split.paceSecondsPerKm)}</strong></li>)}</ol><p>Estimated by Soma from recorded distance intervals.</p></> : <p>{paceState === "loading" ? "Checking recorded distance…" : paceState === "error" ? "Distance intervals could not be loaded." : "Per-kilometer pace is unavailable for this workout."}</p>}
        </div>
        <div className={styles.activityDetailSection}>
          <h3>Heart-rate zones</h3>
          {zones ? <><ol className={styles.activityZones}>{["Light", "Moderate", "Vigorous", "Peak"].map((label, index) => <li key={label}><span>{label}</span><strong>{minutes(zones[index])}</strong></li>)}</ol><p>{hasReportedZones ? "Recorded by Google Health" : `Calculated by Soma from recorded heart rate and Google Health zone limits · ${telemetry?.coverage.percent === null ? "coverage unknown" : `${Math.round(telemetry?.coverage.percent ?? 0)}% of active time measured`}${calculatedZones?.complete ? "" : " · some readings could not be classified"}`}</p></> : <p>{telemetryState === "loading" ? "Checking heart-rate readings…" : "Zone durations are unavailable: this workout has no recorded zone summary or usable daily limits."}</p>}
        </div>
        <div className={styles.activityDetailSection}>
          <h3>Heart rate during workout</h3>
          {telemetry?.heartRateSampleCount ? <><SessionHeartRate samples={telemetry.heartRateSamples} /><p>{telemetry.heartRateSampleCount.toLocaleString("en-US")} readings · {telemetry.coverage.percent === null ? "Coverage unavailable" : `${Math.round(telemetry.coverage.percent)}% measured coverage`}{telemetry.heartRateSamplesDownsampled ? " · chart simplified" : ""}{telemetry.heartRateFetchLimited ? " · API sample limit reached" : ""}. {telemetry.maxHeartRateSource === "google_health_rollup" ? "Maximum from Google Health for the full workout." : "Maximum calculated from available readings."}</p></> : telemetryState === "error" ? <p>Readings could not be loaded. <button type="button" onClick={() => setRetryCount((count) => count + 1)}>Retry</button></p> : <p>{telemetryState === "loading" ? "Loading readings…" : telemetry?.heartRateFetchStatus === "failed" ? "Google Health readings could not be retrieved." : "No heart-rate readings are available for this workout."}{telemetry?.maxHeartRateSource === "google_health_rollup" ? " Workout maximum was retrieved from Google Health." : ""}</p>}
        </div>
      </div>
  </li>;
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
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")} min/km`;
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

  return <section className={`${styles.section} health-observatory-panel`} aria-label="Workout history" data-scroll-reveal="timeline">
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
      {displayed.map((exercise) => <ActivitySession key={exercise.id} exercise={exercise} />)}
      </ol>
    </> : <p className={styles.activityHistoryEmpty}>No imported workouts match these filters.</p>}
  </section>;
}
