import type { NormalizedHealthRecord } from "./aggregate";

export type ActiveHoursSleepInterval = {
  startTime?: string | null;
  endTime?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  payload?: unknown;
};

export type ActiveHourStatus = "active" | "observed_inactive" | "unknown" | "pending" | "sleeping";
export type ActiveHourSource = "activity-level" | "steps" | "mixed" | "none" | "sleep";

export type ActiveHourState = {
  key: string;
  label: string;
  start: string;
  end: string;
  status: ActiveHourStatus;
  source: ActiveHourSource;
  /** Share of awake time in this local hour covered by explicit source intervals. */
  coverage: number | null;
  observedSeconds: number;
  awakeSeconds: number;
  /** Cumulative LIGHTLY_ACTIVE, MODERATELY_ACTIVE, and VERY_ACTIVE interval time. */
  activeSeconds: number | null;
  /** Steps apportioned to this hour from steps intervals; null means no step interval. */
  steps: number | null;
  /** Share of the 60 second activity or 100 step threshold reached, capped at 1. */
  progress: number | null;
};

export type ActiveHoursSummary = {
  date: string;
  timeZone: string;
  computedAt: string;
  source: { start: string; end: string };
  /** Number of completed, awake local-hour windows that met an activity threshold. */
  activeHours: number;
  /** Completed local-hour windows with any awake time; fully sleeping hours are excluded. */
  elapsedHours: number;
  /** Elapsed hour windows classified active or observed inactive. */
  observedHours: number;
  /** Explicitly classified awake seconds divided by awake seconds elapsed. */
  coverage: number | null;
  /** Active-hour share of elapsed awake windows; null when any elapsed window is unknown. */
  progress: number | null;
  complete: boolean;
  hourStates: ActiveHourState[];
  /** Retained interval bounds allow this snapshot to be refreshed without source records. */
  sleepIntervals: Array<{ start: string; end: string }>;
};

export type CalculateActiveHoursInput = {
  /** Civil date in `timeZone`, formatted YYYY-MM-DD. */
  date: string;
  timeZone: string;
  now: Date | string;
  records: NormalizedHealthRecord[];
  /** Optional sleep intervals in addition to `sleep` records present in `records`. */
  sleepIntervals?: ActiveHoursSleepInterval[];
};

type Interval = { start: number; end: number };
type StepInterval = Interval & { count: number };
type ActivityInterval = Interval & { active: boolean };
type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const ACTIVE_LEVELS = new Set(["LIGHTLY_ACTIVE", "MODERATELY_ACTIVE", "VERY_ACTIVE"]);
const INACTIVE_LEVELS = new Set(["SEDENTARY"]);
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const MIN_CLASSIFIED_FRACTION = 5 / 6;
const STEPS_THRESHOLD = 100;
const ACTIVE_SECONDS_THRESHOLD = 60;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTimestamp(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function finiteNonNegativeNumber(value: unknown) {
  if (typeof value === "string" && value.trim()) value = Number(value);
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function intervalFromTimestamps(start: unknown, end: unknown): Interval | null {
  const startMs = parseTimestamp(start);
  const endMs = parseTimestamp(end);
  return startMs !== null && endMs !== null && endMs > startMs ? { start: startMs, end: endMs } : null;
}

function intervalFromPayload(value: unknown): Interval | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = intervalFromPayload(item);
      if (found) return found;
    }
    return null;
  }
  if (!isObject(value)) return null;
  const interval = isObject(value.interval) ? value.interval : null;
  if (interval) {
    const found = intervalFromTimestamps(interval.startTime ?? interval.start_time, interval.endTime ?? interval.end_time);
    if (found) return found;
  }
  for (const child of Object.values(value)) {
    const found = intervalFromPayload(child);
    if (found) return found;
  }
  return null;
}

function findTypedPayload(value: unknown, dataType: "steps" | "activity-level"): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTypedPayload(item, dataType);
      if (found) return found;
    }
    return null;
  }
  if (!isObject(value)) return null;
  const requiredField = dataType === "steps" ? "count" : "activityLevelType";
  if (isObject(value.interval) && requiredField in value) return value;
  for (const child of Object.values(value)) {
    const found = findTypedPayload(child, dataType);
    if (found) return found;
  }
  return null;
}

function localFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

function localParts(timestamp: number, formatter: Intl.DateTimeFormat): LocalParts {
  const parts = formatter.formatToParts(new Date(timestamp));
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((entry) => entry.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day"), hour: part("hour"), minute: part("minute"), second: part("second") };
}

function dateKey(parts: Pick<LocalParts, "year" | "month" | "day">) {
  return `${parts.year.toString().padStart(4, "0")}-${parts.month.toString().padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

function nextCivilDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year!, month! - 1, day! + 1));
  return `${next.getUTCFullYear().toString().padStart(4, "0")}-${(next.getUTCMonth() + 1).toString().padStart(2, "0")}-${next.getUTCDate().toString().padStart(2, "0")}`;
}

function firstInstantOfCivilDate(date: string, formatter: Intl.DateTimeFormat) {
  const [year, month, day] = date.split("-").map(Number);
  const approximate = Date.UTC(year!, month! - 1, day!);
  let low = approximate - 48 * HOUR_MS;
  let high = approximate + 48 * HOUR_MS;
  if (dateKey(localParts(low, formatter)) >= date || dateKey(localParts(high, formatter)) < date) {
    throw new RangeError(`Could not resolve local date ${date} in the requested time zone.`);
  }
  while (high - low > 1) {
    const middle = low + Math.floor((high - low) / 2);
    if (dateKey(localParts(middle, formatter)) >= date) high = middle;
    else low = middle;
  }
  if (dateKey(localParts(high, formatter)) !== date) {
    throw new RangeError(`Local date ${date} does not exist in the requested time zone.`);
  }
  return high;
}

function localDayBounds(date: string, formatter: Intl.DateTimeFormat): Interval {
  const start = firstInstantOfCivilDate(date, formatter);
  const end = firstInstantOfCivilDate(nextCivilDate(date), formatter);
  return { start, end };
}

/** Local civil-day bounds, returned as UTC instants for clipping interval data. */
export function activeHoursDayWindow(date: string, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError("Active hours require a YYYY-MM-DD civil date.");
  const bounds = localDayBounds(date, localFormatter(timeZone));
  return { start: new Date(bounds.start).toISOString(), end: new Date(bounds.end).toISOString() };
}

function localHourBoundaries(bounds: Interval, formatter: Intl.DateTimeFormat) {
  const boundaries = [bounds.start];
  let cursor = bounds.start;
  while (cursor + HOUR_MS < bounds.end) {
    let candidate = cursor + HOUR_MS;
    let local = localParts(candidate, formatter);
    if (local.minute !== 0 || local.second !== 0) {
      // Most zones change offset by whole hours. A short minute scan around a
      // non-hour offset change also handles zones such as Australia/Lord_Howe.
      let found: number | null = null;
      for (let timestamp = candidate - MINUTE_MS; timestamp > cursor; timestamp -= MINUTE_MS) {
        local = localParts(timestamp, formatter);
        if (local.minute === 0 && local.second === 0) {
          found = timestamp;
          break;
        }
      }
      if (found === null) {
        cursor = candidate;
        continue;
      }
      candidate = found;
    }
    boundaries.push(candidate);
    cursor = candidate;
  }
  boundaries.push(bounds.end);
  return boundaries;
}

function offsetLabel(timestamp: number, formatter: Intl.DateTimeFormat) {
  const parts = localParts(timestamp, formatter);
  const wallAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offsetMinutes = Math.round((wallAsUtc - timestamp) / MINUTE_MS);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(offsetMinutes);
  return `UTC${sign}${Math.floor(absolute / 60).toString().padStart(2, "0")}:${(absolute % 60).toString().padStart(2, "0")}`;
}

function formatHourLabel(timestamp: number, formatter: Intl.DateTimeFormat) {
  return `${localParts(timestamp, formatter).hour.toString().padStart(2, "0")}h`;
}

function mergeIntervals(intervals: Interval[]) {
  const sorted = intervals.filter((interval) => interval.end > interval.start).sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (!previous || interval.start > previous.end) merged.push({ ...interval });
    else previous.end = Math.max(previous.end, interval.end);
  }
  return merged;
}

function clipIntervals<T extends Interval>(intervals: T[], bounds: Interval): Array<T & Interval> {
  return intervals.flatMap((interval) => {
    const start = Math.max(interval.start, bounds.start);
    const end = Math.min(interval.end, bounds.end);
    return end > start ? [{ ...interval, start, end }] : [];
  });
}

function subtractIntervals(intervals: Interval[], exclusions: Interval[]) {
  let remaining = [...intervals];
  for (const exclusion of exclusions) {
    remaining = remaining.flatMap((interval) => {
      if (exclusion.end <= interval.start || exclusion.start >= interval.end) return [interval];
      const pieces: Interval[] = [];
      if (exclusion.start > interval.start) pieces.push({ start: interval.start, end: exclusion.start });
      if (exclusion.end < interval.end) pieces.push({ start: exclusion.end, end: interval.end });
      return pieces;
    });
  }
  return remaining;
}

function overlapSeconds(intervals: Interval[], bounds: Interval) {
  return mergeIntervals(clipIntervals(intervals, bounds)).reduce((sum, interval) => sum + (interval.end - interval.start) / 1000, 0);
}

function sleepIntervalsFromRecords(records: NormalizedHealthRecord[]) {
  return records.flatMap((record) => {
    if (record.data_type !== "sleep") return [];
    const interval = intervalFromTimestamps(record.start_time, record.end_time) ?? intervalFromPayload(record.payload);
    return interval ? [interval] : [];
  });
}

function explicitSleepIntervals(intervals: ActiveHoursSleepInterval[] = []) {
  return intervals.flatMap((interval) => {
    const found = intervalFromTimestamps(interval.startTime ?? interval.start_time, interval.endTime ?? interval.end_time)
      ?? intervalFromPayload(interval.payload);
    return found ? [found] : [];
  });
}

function activityIntervals(records: NormalizedHealthRecord[], bounds: Interval) {
  const intervals: ActivityInterval[] = [];
  const stepIntervals: StepInterval[] = [];

  for (const record of records) {
    if (record.data_type !== "steps" && record.data_type !== "activity-level") continue;
    const recordStart = parseTimestamp(record.start_time);
    const recordEnd = parseTimestamp(record.end_time);
    if (recordStart !== null && recordEnd !== null && (recordEnd <= bounds.start || recordStart >= bounds.end)) continue;
    const typed = findTypedPayload(record.payload, record.data_type);
    const interval = intervalFromTimestamps(record.start_time, record.end_time)
      ?? (typed ? intervalFromPayload(typed) : null)
      ?? intervalFromPayload(record.payload);
    if (!interval || !typed) continue;

    if (record.data_type === "steps") {
      const count = finiteNonNegativeNumber(typed.count);
      if (count !== null) stepIntervals.push({ ...interval, count });
    } else {
      const level = typeof typed.activityLevelType === "string" ? typed.activityLevelType.toUpperCase() : "";
      if (ACTIVE_LEVELS.has(level)) intervals.push({ ...interval, active: true });
      else if (INACTIVE_LEVELS.has(level)) intervals.push({ ...interval, active: false });
    }
  }
  return { intervals, stepIntervals };
}

function activitySecondsInHour(intervals: ActivityInterval[], awake: Interval) {
  return overlapSeconds(intervals.filter((interval) => interval.active), awake);
}

function activityLevelObservedInHour(intervals: ActivityInterval[], awake: Interval) {
  return overlapSeconds(intervals, awake) > 0;
}

function stepCountInHour(intervals: StepInterval[], awake: Interval) {
  const relevant = intervals.flatMap((interval) => {
    const start = Math.max(interval.start, awake.start);
    const end = Math.min(interval.end, awake.end);
    if (end <= start) return [];
    return [{ start, end, rate: interval.count / (interval.end - interval.start) }];
  });
  if (!relevant.length) return null;

  // Where samples overlap, use the highest source rate for that time slice. This
  // treats duplicate device/sync intervals as one observation instead of adding them.
  const boundaries = [...new Set(relevant.flatMap((interval) => [interval.start, interval.end]))].sort((a, b) => a - b);
  let total = 0;
  for (let index = 0; index + 1 < boundaries.length; index += 1) {
    const start = boundaries[index]!;
    const end = boundaries[index + 1]!;
    const rate = relevant.filter((interval) => interval.start < end && interval.end > start).reduce((maximum, interval) => Math.max(maximum, interval.rate), 0);
    total += rate * (end - start);
  }
  return total;
}

function measuredCoverageIntervals(activity: ActivityInterval[], steps: StepInterval[]) {
  return [
    ...activity.map((interval) => ({ start: interval.start, end: interval.end })),
    ...steps.map((interval) => ({ start: interval.start, end: interval.end })),
  ];
}

function sourceForHour(activitySeconds: number | null, steps: number | null) {
  if (activitySeconds !== null && steps !== null) return "mixed" as const;
  if (activitySeconds !== null) return "activity-level" as const;
  if (steps !== null) return "steps" as const;
  return "none" as const;
}

/**
 * Calculates local civil-hour activity from interval data only. A step interval
 * contributes its count once across overlaps; activity-level intervals count
 * as activity only for LIGHTLY_ACTIVE, MODERATELY_ACTIVE, or VERY_ACTIVE.
 */
export function calculateActiveHours(input: CalculateActiveHoursInput): ActiveHoursSummary {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new RangeError("Active hours require a YYYY-MM-DD civil date.");
  const now = input.now instanceof Date ? input.now.getTime() : parseTimestamp(input.now);
  if (now === null || !Number.isFinite(now)) throw new RangeError("Active hours require a valid `now` instant.");

  const formatter = localFormatter(input.timeZone);
  const bounds = localDayBounds(input.date, formatter);
  const allSleep = mergeIntervals([
    ...sleepIntervalsFromRecords(input.records),
    ...explicitSleepIntervals(input.sleepIntervals),
  ]);
  const sleep = clipIntervals(allSleep, bounds);
  const { intervals: allActivityIntervals, stepIntervals: allStepIntervals } = activityIntervals(input.records, bounds);
  const activity = clipIntervals(allActivityIntervals, bounds) as ActivityInterval[];
  const steps = clipIntervals(allStepIntervals, bounds) as StepInterval[];
  const measuredIntervals = mergeIntervals(measuredCoverageIntervals(activity, steps));
  const boundaries = localHourBoundaries(bounds, formatter);
  const elapsedHours: ActiveHourState[] = [];
  const hourStates: ActiveHourState[] = [];

  for (let index = 0; index + 1 < boundaries.length; index += 1) {
    const start = boundaries[index]!;
    const end = boundaries[index + 1]!;
    if (start > now) continue;
    const hour = { start, end };
    const activityInHour = activity.filter((interval) => interval.start < end && interval.end > start);
    const stepsInHour = steps.filter((interval) => interval.start < end && interval.end > start);
    const measuredInHour = measuredIntervals.filter((interval) => interval.start < end && interval.end > start);
    const sleeping = mergeIntervals(clipIntervals(sleep, hour));
    const awake = subtractIntervals([hour], sleeping);
    const awakeSeconds = awake.reduce((sum, interval) => sum + (interval.end - interval.start) / 1000, 0);
    const complete = end <= now;
    const current = start <= now && now < end;
    const observedEnd = Math.min(end, now);
    const observedAwake = subtractIntervals([{ start, end: observedEnd }], sleeping);
    const local = localParts(start, formatter);
    const localHour = local.hour.toString().padStart(2, "0");
    const label = formatHourLabel(start, formatter);
    const startISO = new Date(start).toISOString();
    const endISO = new Date(end).toISOString();
    const key = `${input.date}T${localHour}:00${offsetLabel(start, formatter).replace("UTC", "")}`;
    const eligibleIntervals = mergeIntervals(observedAwake.flatMap((interval) => clipIntervals(measuredInHour, interval)));
    const observedSeconds = eligibleIntervals.reduce((sum, interval) => sum + (interval.end - interval.start) / 1000, 0);
    const coverage = awakeSeconds > 0 ? Math.min(1, observedSeconds / awakeSeconds) : null;
    const hasActivityLevel = awakeSeconds > 0 && observedAwake.some((interval) => activityLevelObservedInHour(activityInHour, interval));
    const activeSeconds = hasActivityLevel
      ? observedAwake.reduce((sum, interval) => sum + activitySecondsInHour(activityInHour, interval), 0)
      : null;
    const stepValues = observedAwake.map((interval) => stepCountInHour(stepsInHour, interval));
    const stepCount = stepValues.some((value) => value !== null)
      ? stepValues.reduce<number>((sum, value) => sum + (value ?? 0), 0)
      : null;
    const progress = awakeSeconds > 0 && (activeSeconds !== null || stepCount !== null)
      ? Math.min(1, Math.max((activeSeconds ?? 0) / ACTIVE_SECONDS_THRESHOLD, (stepCount ?? 0) / STEPS_THRESHOLD))
      : null;
    const source = awakeSeconds === 0 ? "sleep" : sourceForHour(activeSeconds, stepCount);
    const activityReached = (activeSeconds ?? 0) >= ACTIVE_SECONDS_THRESHOLD || (stepCount ?? 0) >= STEPS_THRESHOLD;
    const classificationSeconds = Math.min(awakeSeconds, observedSeconds);
    const enoughCoverage = awakeSeconds > 0 && classificationSeconds >= awakeSeconds * MIN_CLASSIFIED_FRACTION;
    const status: ActiveHourStatus = awakeSeconds === 0
      ? "sleeping"
      : current
        ? "pending"
        : activityReached
          ? "active"
          : enoughCoverage
            ? "observed_inactive"
            : "unknown";

    const state: ActiveHourState = {
      key,
      label,
      start: startISO,
      end: endISO,
      status,
      source,
      coverage,
      observedSeconds,
      awakeSeconds,
      activeSeconds,
      steps: stepCount === null ? null : Math.round(stepCount * 100) / 100,
      progress: status === "unknown" || status === "sleeping" || (status === "pending" && progress === null) ? null : progress,
    };
    hourStates.push(state);
    if (complete && awakeSeconds > 0) elapsedHours.push(state);
  }

  const elapsedCount = elapsedHours.length;
  const observed = elapsedHours.filter((hour) => hour.status === "active" || hour.status === "observed_inactive");
  const active = elapsedHours.filter((hour) => hour.status === "active");
  const elapsedAwakeSeconds = elapsedHours.reduce((sum, hour) => sum + hour.awakeSeconds, 0);
  const observedAwakeSeconds = elapsedHours.reduce((sum, hour) => sum + hour.observedSeconds, 0);
  const currentHour = hourStates.find((hour) => {
    const hourStart = Date.parse(hour.start);
    const hourEnd = Date.parse(hour.end);
    return hourStart <= now && now < hourEnd;
  });
  const currentAwakeElapsedSeconds = currentHour && currentHour.status !== "sleeping"
    ? subtractIntervals([{ start: Date.parse(currentHour.start), end: now }], sleep)
      .reduce((sum, interval) => sum + (interval.end - interval.start) / 1000, 0)
    : 0;
  const complete = elapsedCount > 0 && observed.length === elapsedCount;

  return {
    date: input.date,
    timeZone: input.timeZone,
    computedAt: new Date(now).toISOString(),
    source: { start: new Date(bounds.start).toISOString(), end: new Date(bounds.end).toISOString() },
    activeHours: active.length,
    elapsedHours: elapsedCount,
    observedHours: observed.length,
    coverage: elapsedAwakeSeconds + currentAwakeElapsedSeconds > 0
      ? Math.min(1, (observedAwakeSeconds + (currentHour?.observedSeconds ?? 0)) / (elapsedAwakeSeconds + currentAwakeElapsedSeconds))
      : null,
    progress: complete ? active.length / elapsedCount : null,
    complete,
    hourStates,
    sleepIntervals: sleep.map((interval) => ({ start: new Date(interval.start).toISOString(), end: new Date(interval.end).toISOString() })),
  };
}

/** Refreshes clock-dependent hour statuses while preserving evidence in the snapshot. */
export function refreshActiveHoursSummary(summary: ActiveHoursSummary, now: Date | string): ActiveHoursSummary {
  const timestamp = now instanceof Date ? now.getTime() : parseTimestamp(now);
  if (timestamp === null || !Number.isFinite(timestamp)) throw new RangeError("Active hours require a valid `now` instant.");
  const formatter = localFormatter(summary.timeZone);
  const start = parseTimestamp(summary.source.start);
  const end = parseTimestamp(summary.source.end);
  if (start === null || end === null || end <= start) throw new RangeError("Active hours summary has invalid source bounds.");
  const bounds = { start, end };
  const sleep = mergeIntervals((summary.sleepIntervals ?? []).flatMap((interval) => {
    const parsed = intervalFromTimestamps(interval.start, interval.end);
    return parsed ? [parsed] : [];
  }));
  const prior = new Map(summary.hourStates.map((hour) => [hour.key, hour]));
  const boundaries = localHourBoundaries(bounds, formatter);
  const hourStates: ActiveHourState[] = [];

  for (let index = 0; index + 1 < boundaries.length; index += 1) {
    const hourStart = boundaries[index]!;
    const hourEnd = boundaries[index + 1]!;
    if (hourStart > timestamp) break;
    const keyParts = localParts(hourStart, formatter);
    const key = `${summary.date}T${keyParts.hour.toString().padStart(2, "0")}:00${offsetLabel(hourStart, formatter).replace("UTC", "")}`;
    const previous = prior.get(key);
    const sleeping = mergeIntervals(clipIntervals(sleep, { start: hourStart, end: hourEnd }));
    const awakeIntervals = subtractIntervals([{ start: hourStart, end: hourEnd }], sleeping);
    const awakeSeconds = awakeIntervals.reduce((total, interval) => total + (interval.end - interval.start) / 1000, 0);
    const isComplete = hourEnd <= timestamp;
    const isCurrent = hourStart <= timestamp && timestamp < hourEnd;
    const observedEnd = Math.min(hourEnd, timestamp);
    const observedAwakeIntervals = subtractIntervals([{ start: hourStart, end: observedEnd }], sleeping);
    const observedAwakeSeconds = observedAwakeIntervals.reduce((total, interval) => total + (interval.end - interval.start) / 1000, 0);
    const label = formatHourLabel(hourStart, formatter);
    const hourStartIso = new Date(hourStart).toISOString();
    const hourEndIso = new Date(hourEnd).toISOString();

    if (awakeSeconds === 0) {
      hourStates.push({
        key, label, start: hourStartIso, end: hourEndIso, status: "sleeping", source: "sleep",
        coverage: null, observedSeconds: 0, awakeSeconds: 0, activeSeconds: null, steps: null, progress: null,
      });
      continue;
    }

    const base = previous ?? {
      key, label, start: hourStartIso, end: hourEndIso, status: "unknown" as const, source: "none" as const,
      coverage: 0, observedSeconds: 0, awakeSeconds, activeSeconds: null, steps: null, progress: null,
    };
    const observedSeconds = Math.min(base.observedSeconds, observedAwakeSeconds);
    const coverage = Math.min(1, observedSeconds / awakeSeconds);
    const activeSeconds = base.activeSeconds === null ? null : Math.min(base.activeSeconds, observedAwakeSeconds);
    const steps = base.steps === null ? null : base.steps;
    const reachedActivity = (activeSeconds ?? 0) >= ACTIVE_SECONDS_THRESHOLD || (steps ?? 0) >= STEPS_THRESHOLD;
    const status: ActiveHourStatus = isCurrent
      ? "pending"
      : isComplete
        ? reachedActivity
          ? "active"
          : observedSeconds >= awakeSeconds * MIN_CLASSIFIED_FRACTION
            ? "observed_inactive"
            : "unknown"
        : "pending";
    const progress = activeSeconds !== null || steps !== null
      ? Math.min(1, Math.max((activeSeconds ?? 0) / ACTIVE_SECONDS_THRESHOLD, (steps ?? 0) / STEPS_THRESHOLD))
      : null;
    hourStates.push({
      key, label, start: hourStartIso, end: hourEndIso, status, source: base.source, coverage,
      observedSeconds, awakeSeconds, activeSeconds, steps,
      progress: status === "unknown" || progress === null ? null : progress,
    });
  }

  const elapsed = hourStates.filter((hour) => Date.parse(hour.end) <= timestamp && hour.awakeSeconds > 0);
  const observed = elapsed.filter((hour) => hour.status === "active" || hour.status === "observed_inactive");
  const active = elapsed.filter((hour) => hour.status === "active");
  const elapsedAwakeSeconds = elapsed.reduce((total, hour) => total + hour.awakeSeconds, 0);
  const observedAwakeSeconds = elapsed.reduce((total, hour) => total + hour.observedSeconds, 0);
  const currentHour = hourStates.find((hour) => {
    const hourStart = Date.parse(hour.start);
    const hourEnd = Date.parse(hour.end);
    return hourStart <= timestamp && timestamp < hourEnd;
  });
  const currentAwakeElapsedSeconds = currentHour && currentHour.status !== "sleeping"
    ? subtractIntervals([{ start: Date.parse(currentHour.start), end: timestamp }], sleep)
      .reduce((total, interval) => total + (interval.end - interval.start) / 1000, 0)
    : 0;
  const complete = elapsed.length > 0 && observed.length === elapsed.length;

  return {
    ...summary,
    computedAt: new Date(timestamp).toISOString(),
    activeHours: active.length,
    elapsedHours: elapsed.length,
    observedHours: observed.length,
    coverage: elapsedAwakeSeconds + currentAwakeElapsedSeconds > 0
      ? Math.min(1, (observedAwakeSeconds + (currentHour?.observedSeconds ?? 0)) / (elapsedAwakeSeconds + currentAwakeElapsedSeconds))
      : null,
    progress: complete ? active.length / elapsed.length : null,
    complete,
    hourStates,
  };
}
