"use client";

import { useMemo } from "react";

import {
  ACTIVITY_SESSION_METRICS,
  activityFilterForType,
  activityFilterLabel,
  activityMetricAverage,
  activityMetricPoints,
  activityRegularity,
  activityVolumeAverage,
  activityVolumePoints,
  type ActivityBucket,
  type ActivityFilter,
  type ActivityPeriod,
  type ActivitySessionMetricDefinition,
  type ActivityVolumeMetric,
} from "@/domain/health/activity-sport-analytics";
import type { MetricPoint } from "@/domain/metrics/trends";
import type { ExerciseSummary } from "@/services/health-analytics";

import { MetricTrendCard } from "./metric-trend-card";
import styles from "./activity-redesign.module.css";

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function durationText(minutes: number) {
  const rounded = Math.round(Math.abs(minutes));
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return hours === 0 ? remainder + " min" : hours + " h " + String(remainder).padStart(2, "0");
}

function valueFormatter(definition: ActivitySessionMetricDefinition) {
  if (definition.format === "duration") return (value: number) => durationText(value);
  if (definition.format === "pace") return (value: number) => {
    const rounded = Math.round(Math.abs(value));
    return Math.floor(rounded / 60) + ":" + String(rounded % 60).padStart(2, "0") + " min/km";
  };
  return (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: definition.digits, minimumFractionDigits: definition.digits });
}

function formatDelta(delta: number, definition: ActivitySessionMetricDefinition) {
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const absolute = Math.abs(delta);
  if (definition.format === "duration") return sign + durationText(absolute);
  if (definition.format === "pace") {
    const rounded = Math.round(absolute);
    return sign + Math.floor(rounded / 60) + ":" + String(rounded % 60).padStart(2, "0") + " min/km";
  }
  const amount = absolute.toLocaleString("en-US", { maximumFractionDigits: definition.digits, minimumFractionDigits: definition.digits });
  return sign + amount + (definition.unit ? " " + definition.unit : "");
}

function toneFor(value: number | null, reference: number | null, direction: ActivitySessionMetricDefinition["direction"]) {
  if (value === null || reference === null || direction === "context_only" || Math.abs(value - reference) < 0.0001) return "neutral" as const;
  const higher = value > reference;
  return (direction === "higher_is_better" ? higher : !higher) ? "positive" as const : "negative" as const;
}

function latestMeasured(points: readonly MetricPoint[]) {
  return [...points].reverse().find((point) => finite(point.value))?.value ?? null;
}

function sumDuration(exercises: readonly ExerciseSummary[]) {
  if (!exercises.length) return null;
  const values = exercises.map((exercise) => exercise.durationMinutes);
  return values.every(finite) ? values.reduce((sum, value) => sum + value, 0) : null;
}

function countInLast30Days(exercises: readonly ExerciseSummary[], referenceDate: string) {
  const start = new Date(referenceDate + "T12:00:00.000Z");
  if (!Number.isFinite(start.getTime())) return [];
  start.setUTCDate(start.getUTCDate() - 29);
  const firstDate = start.toISOString().slice(0, 10);
  return exercises.filter((exercise) => exercise.date >= firstDate && exercise.date <= referenceDate);
}

function referenceForVolume(
  exercises: readonly ExerciseSummary[],
  points: readonly MetricPoint[],
  referenceDate: string,
  bucket: ActivityBucket,
  metric: ActivityVolumeMetric,
  unit?: string,
) {
  const baseline = activityVolumeAverage(exercises, referenceDate, bucket, metric);
  const current = latestMeasured(points);
  const definition: ActivitySessionMetricDefinition = metric === "durationMinutes"
    ? { key: "durationMinutes", label: "Activity time", format: "duration", digits: 0, direction: "context_only", value: () => null }
    : { key: "steps", label: "Sessions", unit, format: "number", digits: bucket === "week" ? 1 : 0, direction: "context_only", value: () => null };
  const delta = current === null || baseline.value === null ? undefined : formatDelta(current - baseline.value, definition);
  return {
    value: baseline.value,
    label: "30-day avg",
    sampleSize: baseline.sampleSize,
    tone: "neutral" as const,
    deltaLabel: delta ? delta + " vs avg" : undefined,
  };
}

function VolumeTrend({
  exercises,
  referenceDate,
  period,
  bucket,
  metric,
}: {
  exercises: readonly ExerciseSummary[];
  referenceDate: string;
  period: ActivityPeriod;
  bucket: ActivityBucket;
  metric: ActivityVolumeMetric;
}) {
  const points = activityVolumePoints(exercises, referenceDate, period, bucket, metric);
  const label = metric === "sessions"
    ? bucket === "week" ? "Sessions per week" : "Sessions per month"
    : bucket === "week" ? "Activity time per week" : "Activity time per month";
  const unit = metric === "sessions" ? "sessions" : undefined;
  const format = metric === "sessions"
    ? (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 1 })
    : durationText;
  const reference = referenceForVolume(exercises, points, referenceDate, bucket, metric, unit);
  return <MetricTrendCard
    label={label}
    points={points}
    unit={metric === "sessions" ? undefined : unit}
    direction="context_only"
    format={format}
    valueFormat={metric === "sessions" ? "number" : "duration"}
    chartType="bar"
    compact
    displayDays={period}
    averageInChart
    inlineReference={reference}
    highlightLatest
  />;
}

function SportOverview({
  visibleExercises,
  onSelect,
}: {
  visibleExercises: readonly ExerciseSummary[];
  onSelect: (filter: ActivityFilter) => void;
}) {
  const groups = new Map<ActivityFilter, ExerciseSummary[]>();
  for (const exercise of visibleExercises) {
    const filter = activityFilterForType(exercise.type);
    const group = groups.get(filter) ?? [];
    group.push(exercise);
    groups.set(filter, group);
  }
  const orderedGroups = [...groups.entries()].sort(([first], [second]) => activityFilterLabel(first).localeCompare(activityFilterLabel(second)));
  if (!orderedGroups.length) return <p className={styles.activitySportEmpty}>No imported workouts match this period. Choose a longer period to view older sessions.</p>;
  return <div className={styles.activitySportOverview} aria-label="Activity volume by sport">
    <p>Workout counts and time stay separate by sport.</p>
    <ul>
      {orderedGroups.map(([filter, sessions]) => {
        const time = sumDuration(sessions);
        const measuredTimes = sessions.filter((exercise) => finite(exercise.durationMinutes)).length;
        const timeLabel = time === null ? "Duration unavailable · " + measuredTimes + "/" + sessions.length + " measured" : durationText(time) + " total · " + measuredTimes + "/" + sessions.length + " measured";
        return <li key={filter}>
          <button type="button" onClick={() => onSelect(filter)}>
            <span><strong>{activityFilterLabel(filter)}</strong><small>{sessions.length} imported sessions · {timeLabel}</small></span>
            <span>View trends</span>
          </button>
        </li>;
      })}
    </ul>
    <p className={styles.activitySportSource}>Counts and duration use imported Google Health workout records.</p>
  </div>;
}

export function ActivitySportInsights({
  filter,
  period,
  referenceDate,
  timezone,
  exercises,
  visibleExercises,
  onSelect,
}: {
  filter: ActivityFilter;
  period: ActivityPeriod;
  referenceDate: string;
  timezone: string;
  exercises: readonly ExerciseSummary[];
  visibleExercises: readonly ExerciseSummary[];
  onSelect: (filter: ActivityFilter) => void;
}) {
  const selectedExercises = useMemo(() => filter === "all" ? [] : exercises, [filter, exercises]);
  const last30Days = useMemo(() => countInLast30Days(selectedExercises, referenceDate), [selectedExercises, referenceDate]);
  const regularity = useMemo(() => activityRegularity(selectedExercises, referenceDate), [selectedExercises, referenceDate]);
  const time30Days = sumDuration(last30Days);
  const timeSample = last30Days.filter((exercise) => finite(exercise.durationMinutes)).length;
  const sessionRate = last30Days.length / (30 / 7);
  const trendData = useMemo(() => ACTIVITY_SESSION_METRICS
    .filter((definition) => filter !== "all" && visibleExercises.some((exercise) => finite(definition.value(exercise))))
    .map((definition) => {
      const points = activityMetricPoints(visibleExercises, definition, timezone);
      const baseline = activityMetricAverage(selectedExercises, definition, referenceDate);
      const current = latestMeasured(points);
      return {
        definition,
        points,
        reference: {
          value: baseline.value,
          label: "30-day avg",
          sampleSize: baseline.sampleSize,
          tone: toneFor(current, baseline.value, definition.direction),
          deltaLabel: current === null || baseline.value === null ? undefined : formatDelta(current - baseline.value, definition) + " vs avg",
        },
      };
    }), [filter, referenceDate, selectedExercises, timezone, visibleExercises]);

  if (filter === "all") return <SportOverview visibleExercises={visibleExercises} onSelect={onSelect} />;

  const selectedLabel = activityFilterLabel(filter);
  const regularityTone = regularity?.deltaPoints === null || regularity?.deltaPoints === undefined || regularity.deltaPoints === 0
    ? "neutral"
    : regularity.deltaPoints > 0 ? "positive" : "negative";

  return <section className={styles.activitySportDetail} aria-label={selectedLabel + " workout metrics"}>
    <dl className={styles.activitySportReadings}>
      <div><dt>Imported sessions · 30d</dt><dd>{last30Days.length}</dd><small>{sessionRate.toLocaleString("en-US", { maximumFractionDigits: 1 })} per week on average</small></div>
      <div><dt>Activity time · 30d</dt><dd>{time30Days === null ? "—" : durationText(time30Days)}</dd><small>{timeSample}/{last30Days.length} workout durations measured</small></div>
      <div><dt>Regularity · 30d</dt><dd data-tone={regularityTone}>
        {regularity?.percent === null || regularity?.percent === undefined ? "—" : regularity.activeWeeks + "/" + regularity.totalWeeks + " weeks · " + regularity.percent + "%"}
      </dd><small>{regularity?.deltaPoints === null || regularity?.deltaPoints === undefined ? "Compared with the previous 30 days: unavailable" : (regularity.deltaPoints > 0 ? "+" : "") + regularity.deltaPoints + " points vs previous 30d"}</small></div>
      <div><dt>Average session length · 30d</dt><dd>{last30Days.length && timeSample ? durationText(last30Days.reduce((sum, exercise) => sum + (exercise.durationMinutes ?? 0), 0) / timeSample) : "—"}</dd><small>{timeSample} measured sessions</small></div>
    </dl>
    <p className={styles.activitySportSource}>Google Health measurements. Pace uses the source value when available; otherwise Soma calculates it from active time and distance.</p>
    {visibleExercises.length === 0
      ? <p className={styles.activitySportEmpty}>No imported {selectedLabel.toLowerCase()} sessions in this period. Choose a longer period to view older sessions.</p>
      : <div className={styles.trendGrid}>
        <VolumeTrend exercises={selectedExercises} referenceDate={referenceDate} period={period} bucket="week" metric="sessions" />
        <VolumeTrend exercises={selectedExercises} referenceDate={referenceDate} period={period} bucket="week" metric="durationMinutes" />
        <VolumeTrend exercises={selectedExercises} referenceDate={referenceDate} period={period} bucket="month" metric="sessions" />
        <VolumeTrend exercises={selectedExercises} referenceDate={referenceDate} period={period} bucket="month" metric="durationMinutes" />
        {trendData.map(({ definition, points, reference }) => <MetricTrendCard
          key={definition.key}
          label={definition.label}
          points={points}
          unit={definition.format === "pace" ? undefined : definition.unit}
          direction={definition.direction}
          format={valueFormatter(definition)}
          valueFormat={definition.format}
          chartType="bar"
          compact
          displayDays={period}
          averageInChart
          inlineReference={reference}
          highlightLatest
        />)}
      </div>}
  </section>;
}
