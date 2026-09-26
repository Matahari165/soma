"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  ACTIVITY_FILTERS,
  activityFilterForType,
  activityFilterLabel,
  activityFilterOptions,
  activityMatchesFilter,
  type ActivityFilter,
  type ActivityPeriod,
} from "@/domain/health/activity-sport-analytics";
import type { ActivitySessionTelemetry } from "@/domain/health/activity-session-telemetry";
import type { ExerciseSummary } from "@/services/health-analytics";

import { ActivitySportInsights } from "./activity-sport-insights";
import styles from "./activity-redesign.module.css";

type SessionTelemetry = ActivitySessionTelemetry;
type EstimatedSplit = { index: number; distanceKm: number; paceSecondsPerKm: number; partial: boolean };

const periods: { days: ActivityPeriod; label: string }[] = [
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 30, label: "1 month" },
  { days: 60, label: "2 months" },
  { days: 90, label: "3 months" },
  { days: 180, label: "6 months" },
];

export function exerciseMatchesFilter(type: string, filter: ActivityFilter): boolean {
  return activityMatchesFilter(type, filter);
}

function activityLabel(type: string) {
  return activityFilterLabel(activityFilterForType(type));
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
  const detailId = useId();
  const [open, setOpen] = useState(false);
  const [telemetry, setTelemetry] = useState<SessionTelemetry | null>(null);
  const [telemetryState, setTelemetryState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [retryCount, setRetryCount] = useState(0);
  const [estimatedSplits, setEstimatedSplits] = useState<EstimatedSplit[]>([]);
  const [paceState, setPaceState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  useEffect(() => {
    if (!open || !exercise.startTime || !exercise.endTime) return;
    const controller = new AbortController();
    fetch(`/api/health/activity-session?record=${encodeURIComponent(exercise.id)}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error("Session telemetry unavailable"); return response.json() as Promise<SessionTelemetry>; })
      .then((result) => { if (!controller.signal.aborted) { setTelemetry(result); setTelemetryState("ready"); } })
      .catch(() => { if (!controller.signal.aborted) setTelemetryState("error"); });
    return () => controller.abort();
  }, [open, exercise.id, exercise.startTime, exercise.endTime, retryCount]);
  const retryTelemetry = () => { setTelemetryState("loading"); setRetryCount((count) => count + 1); };
  const hasPace = !exerciseMatchesFilter(exercise.type, "boxing") && !exerciseMatchesFilter(exercise.type, "strength");
  const loadPace = () => {
    if (!hasPace || exercise.splits?.length || !exercise.startTime || !exercise.endTime || paceState !== "idle") return;
    setPaceState("loading");
    fetch(`/api/health/activity-session-pace?record=${encodeURIComponent(exercise.id)}`, { cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error("Session pace unavailable"); return response.json() as Promise<{ splits: EstimatedSplit[] }>; })
      .then((result) => { setEstimatedSplits(result.splits); setPaceState("ready"); })
      .catch(() => setPaceState("error"));
  };
  const reportedZones = exercise.heartRateZones;
  const hasReportedZones = reportedZones && Object.values(reportedZones).some((value) => typeof value === "number" && Number.isFinite(value));
  const calculatedZones = telemetry?.calculatedZones;
  const hasDetailedHeartRate = Boolean(telemetry?.heartRateSampleCount);
  const showReportedZones = !hasDetailedHeartRate && telemetryState === "ready" && hasReportedZones;
  const reportedSeconds = showReportedZones
    ? [reportedZones.lightMinutes, reportedZones.moderateMinutes, reportedZones.vigorousMinutes, reportedZones.peakMinutes].map((value) => value === null ? null : value * 60)
    : null;
  const maxHeartRate = telemetry?.maxHeartRateBpm ?? exercise.maximumHeartRate ?? null;
  const maxHeartRateText = maxHeartRate === null && telemetryState === "loading" ? "Loading…" : `${telemetry?.heartRateFetchLimited && telemetry.maxHeartRateSource !== "google_health_rollup" && maxHeartRate !== null ? "≥" : ""}${metric(maxHeartRate, "bpm")}`;
  return <li className={styles.activitySession}>
      <div className={styles.activityHistoryRow}>
        <div className={styles.activityHistoryIdentity}><button type="button" aria-expanded={open} aria-controls={detailId} onClick={() => { if (!open) { loadPace(); if (exercise.startTime && exercise.endTime) setTelemetryState("loading"); } setOpen((value) => !value); }} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}><strong>{exercise.name}</strong><span className={styles.activityDetailPrompt}>Workout details <ChevronDown size={14} aria-hidden="true" /></span></button><span>{exercise.date} · {activityLabel(exercise.type)}</span></div>
        <dl className={styles.activityHistoryMetrics}>
          {hasPace && <div><dt>Distance</dt><dd>{metric(exercise.distanceKm, "km", 2)}</dd></div>}
          <div><dt>Duration</dt><dd>{sessionDuration(exercise.durationMinutes)}</dd></div>
          {hasPace && <div><dt>Pace</dt><dd>{pace(exercise)}</dd></div>}
          <div><dt>Avg HR</dt><dd>{metric(exercise.averageHeartRate, "bpm")}</dd></div>
          <div><dt>Max HR</dt><dd>{maxHeartRateText}</dd></div>
          <div><dt>Estimated calories</dt><dd>{metric(exercise.calories, "kcal")}</dd></div>
        </dl>
      </div>
      <div id={detailId} className={styles.activitySessionDetails} hidden={!open} aria-busy={telemetryState === "loading"}>
        {hasPace && <div className={styles.activityDetailSection}>
          <h3>Pace by split</h3>
          {exercise.splits?.length ? <ol className={styles.activitySplits}>{exercise.splits.map((split, index) => <li key={`${split.startTime ?? index}-${index}`}><span>{split.distanceKm !== null && Math.abs(split.distanceKm - 1) < 0.05 ? `Kilometer ${index + 1}` : `Split ${index + 1}`}</span><span>{metric(split.distanceKm, "km", 2)}</span><strong>{paceValue(split.averagePaceSecondsPerKm)}</strong></li>)}</ol> : estimatedSplits.length ? <><ol className={styles.activitySplits}>{estimatedSplits.map((split) => <li key={split.index}><span>{split.partial ? `Final segment` : `Kilometer ${split.index}`}</span><span>{metric(split.distanceKm, "km", 2)}</span><strong>{paceValue(split.paceSecondsPerKm)}</strong></li>)}</ol><p>Estimated by Soma from recorded distance intervals.</p></> : <p>{paceState === "loading" ? "Checking recorded distance…" : paceState === "error" ? "Distance intervals could not be loaded." : "Per-kilometer pace is unavailable for this workout."}</p>}
        </div>}
        <div className={styles.activityDetailSection}>
          <h3>Heart-rate zones</h3>
          {hasDetailedHeartRate && calculatedZones ? <>
            <ol className={styles.activityZones}>{(["z1", "z2", "z3", "z4", "z5"] as const).map((zone, index) => <li key={zone}><span>{zone.toUpperCase()} · {50 + index * 10}–{60 + index * 10}%</span><strong>{minutes(calculatedZones.seconds[zone])}</strong></li>)}</ol>
            {calculatedZones.belowZoneSeconds > 0 && <p>Below 50% of maximum: {minutes(calculatedZones.belowZoneSeconds)}.</p>}
            {calculatedZones.aboveMaximumSeconds > 0 && <p>Above reference maximum: {minutes(calculatedZones.aboveMaximumSeconds)}. <a href="/settings?tab=profile">Review your maximum heart rate</a>.</p>}
            <p>Calculated by Soma · % of maximum heart rate · reference {calculatedZones.maximumHeartRate.bpm} bpm ({calculatedZones.maximumHeartRate.source === "personal" ? "personal" : "estimated from age"}) · {telemetry?.coverage.percent === null ? "coverage unknown" : `${Math.round(telemetry?.coverage.percent ?? 0)}% of active time measured`}{calculatedZones.complete ? "" : " · some readings could not be classified"}.</p>
          </> : reportedSeconds ? <>
            <ol className={styles.activityZones}>{["Light", "Moderate", "Vigorous", "Peak"].map((label, index) => <li key={label}><span>{label}</span><strong>{minutes(reportedSeconds[index])}</strong></li>)}</ol>
            <p>Recorded by Google Health · no detailed heart-rate measurements available for calculation by Soma.</p>
          </> : <p>{telemetryState === "loading" ? "Checking heart-rate readings…" : hasDetailedHeartRate ? <>Zones could not be calculated from these readings. <a href="/settings?tab=profile">Check your maximum heart rate</a> and measurement coverage.</> : "Zone durations are unavailable: no detailed heart-rate measurements or recorded zone summary."}</p>}
        </div>
        <div className={styles.activityDetailSection} aria-live="polite">
          <h3>Heart rate during workout</h3>
          {telemetry?.heartRateSampleCount ? <><SessionHeartRate samples={telemetry.heartRateSamples} /><p>{telemetry.heartRateSampleCount.toLocaleString("en-US")} readings · {telemetry.coverage.percent === null ? "Coverage unavailable" : `${Math.round(telemetry.coverage.percent)}% measured coverage`}{telemetry.heartRateSamplesDownsampled ? " · chart simplified" : ""}{telemetry.heartRateFetchLimited ? " · API sample limit reached" : ""}. {telemetry.maxHeartRateSource === "google_health_rollup" ? "Maximum from Google Health for the full workout." : "Maximum calculated from available readings."}</p></> : telemetryState === "error" ? <p>Readings could not be loaded. <button type="button" onClick={retryTelemetry}>Retry</button></p> : <p>{telemetryState === "loading" ? "Loading readings…" : telemetry?.heartRateFetchStatus === "failed" ? "Google Health readings could not be retrieved." : "No heart-rate readings are available for this workout."}{telemetry?.maxHeartRateSource === "google_health_rollup" ? " Workout maximum was retrieved from Google Health." : ""}</p>}
          {telemetry?.heartRateSampleCount && (telemetryState === "error" || telemetry.heartRateFetchStatus === "failed") ? <p>Some readings could not be refreshed. Available measurements are shown. <button type="button" onClick={retryTelemetry}>Retry</button></p> : null}
          {!telemetry?.heartRateSampleCount && telemetryState !== "error" && telemetry?.heartRateFetchStatus === "failed" && <p><button type="button" onClick={retryTelemetry}>Retry</button></p>}
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

export function ActivityHistory({ exercises, referenceDate, timezone = "UTC", historyRevision }: { exercises: ExerciseSummary[]; referenceDate: string; timezone?: string; historyRevision?: string | null }) {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [period, setPeriod] = useState<ActivityPeriod>(30);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [filtersWereUsed, setFiltersWereUsed] = useState(false);
  const historyKey = useMemo(() => JSON.stringify([referenceDate, historyRevision, exercises]), [referenceDate, historyRevision, exercises]);
  const [history, setHistory] = useState<{ key: string; exercises: ExerciseSummary[] } | null>(null);
  const [failedHistoryKey, setFailedHistoryKey] = useState<string | null>(null);
  const historyError = failedHistoryKey === historyKey;
  const [historyRetry, setHistoryRetry] = useState(0);
  const loadedHistory = history?.key === historyKey ? history.exercises : null;
  const historyLoading = filtersWereUsed && loadedHistory === null && !historyError;
  useEffect(() => {
    if (!filtersWereUsed || loadedHistory !== null) return;
    const controller = new AbortController();
    const from = new Date(`${referenceDate}T12:00:00Z`);
    from.setUTCDate(from.getUTCDate() - 179);
    const params = new URLSearchParams({ from: from.toISOString().slice(0, 10), to: referenceDate });
    void fetch(`/api/health/activity-history?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Exercise history unavailable");
        return response.json() as Promise<{ exercises: ExerciseSummary[] }>;
      }).then((value) => {
        if (!controller.signal.aborted) { setHistory({ key: historyKey, exercises: value.exercises }); setFailedHistoryKey(null); }
      }).catch(() => { if (!controller.signal.aborted) setFailedHistoryKey(historyKey); });
    return () => controller.abort();
  }, [filtersWereUsed, referenceDate, loadedHistory, historyRetry, historyKey]);
  const periodPickerRef = useRef<HTMLDivElement>(null);
  const periodTriggerRef = useRef<HTMLButtonElement>(null);
  const typeFiltered = (filtersWereUsed ? loadedHistory ?? [] : exercises).filter((exercise) => exerciseMatchesFilter(exercise.type, filter));
  const visible = typeFiltered.filter((exercise) => exerciseIsInPeriod(exercise.date, referenceDate, period));
  const displayed = displayedActivities(visible, filtersWereUsed);
  const averages = useMemo(() => activityAverages(displayed), [displayed]);
  const periodLabel = periods.find((item) => item.days === period)?.label ?? "Period";
  const unknownFilters = activityFilterOptions(exercises).filter((item) => item.startsWith("other:"));
  const closePeriod = useCallback(() => {
    setPeriodOpen(false);
    window.requestAnimationFrame(() => periodTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!periodOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!periodPickerRef.current?.contains(event.target as Node)) setPeriodOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePeriod();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [periodOpen, closePeriod]);

  return <section className={`${styles.section} ${styles.activityHistorySection} health-observatory-panel`} data-period-open={periodOpen ? "true" : "false"} aria-label="Workout history" data-scroll-reveal="timeline">
    <div className={styles.activityFilterGroups}>
      <div className={styles.activityFilters} role="group" aria-label="Filter workouts by activity">
      {ACTIVITY_FILTERS.map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => { setFilter(item.id); setFiltersWereUsed(item.id !== "all"); }}>{item.label}</button>)}
      {unknownFilters.length > 0 && <label className={styles.activitySportSelect}>Other sports
        <select aria-label="Filter workouts by other sport" value={filter.startsWith("other:") ? filter : ""} onChange={(event) => { if (event.target.value) { setFilter(event.target.value as ActivityFilter); setFiltersWereUsed(true); } }}>
          <option value="">Choose a sport</option>
          {unknownFilters.map((item) => <option key={item} value={item}>{activityFilterLabel(item)}</option>)}
        </select>
      </label>}
      </div>
      <div className={styles.periodPicker} ref={periodPickerRef}>
        <button ref={periodTriggerRef} className={styles.periodTrigger} type="button" aria-expanded={periodOpen} aria-controls="activity-period-options" onClick={() => setPeriodOpen((open) => !open)}><SlidersHorizontal size={15} aria-hidden="true" /><span>Period · {periodLabel}</span><ChevronDown size={14} aria-hidden="true" /></button>
        <div className={styles.periodPanel} data-open={periodOpen ? "true" : "false"} id="activity-period-options" aria-hidden={!periodOpen} inert={!periodOpen}>
          <div className={styles.periodOptions} role="group" aria-label="Filter workouts by period">
            {periods.map((item) => <button key={item.days} type="button" aria-pressed={period === item.days} onClick={() => { setPeriod(item.days); setFiltersWereUsed(true); closePeriod(); }}>{item.label}</button>)}
          </div>
        </div>
      </div>
    </div>
    <ActivitySportInsights
      filter={filter}
      period={period}
      referenceDate={referenceDate}
      timezone={timezone}
      exercises={typeFiltered}
      visibleExercises={visible}
      onSelect={(selected) => { setFilter(selected); setFiltersWereUsed(selected !== "all"); }}
    />
    {historyLoading ? <p className={styles.activityHistoryEmpty} role="status">Loading workout history…</p> : historyError ? <div className={styles.activityHistoryEmpty} role="alert"><p>Workout history could not be loaded.</p><button type="button" className="secondary-button" onClick={() => { setFailedHistoryKey(null); setHistoryRetry((value) => value + 1); }}>Retry</button></div> : displayed.length ? <>
      <div className={`${styles.activityHistoryRow} ${styles.activityAverageRow}`} role="group" aria-label="Average for displayed workouts">
        <div className={styles.activityHistoryIdentity}><strong>Average</strong><span>{filtersWereUsed ? `${periodLabel} · current filters` : displayed.length}</span></div>
        <dl className={styles.activityHistoryMetrics}>
          {filter !== "boxing" && filter !== "strength" && <div><dt>Distance</dt><dd>{metric(averages.distanceKm, "km", 2)}</dd></div>}
          <div><dt>Duration</dt><dd>{sessionDuration(averages.durationMinutes)}</dd></div>
          {filter !== "boxing" && filter !== "strength" && <div><dt>Pace</dt><dd>{paceValue(averages.averagePaceSecondsPerKm)}</dd></div>}
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
