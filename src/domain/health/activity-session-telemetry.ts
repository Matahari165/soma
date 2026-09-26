import {
  classifyPercentMaxHeartRate,
  type HeartRateZoneName,
  type MaximumHeartRate,
} from "./heart-rate-zones";

export type { HeartRateZoneName } from "./heart-rate-zones";

export type ActivitySessionTelemetryInput = {
  startTime: string;
  endTime: string;
  heartRateRecords: Array<{
    measuredAt: string | null;
    sourceRecordId?: string | null;
    payload: unknown;
  }>;
  maximumHeartRate?: MaximumHeartRate | null;
  exercisePayloads?: unknown[];
  heartRateSampleSource?: ActivitySessionTelemetry["heartRateSampleSource"];
  heartRateFetchLimited?: boolean;
  heartRateFetchStatus?: ActivitySessionTelemetry["heartRateFetchStatus"];
};

export type ActivitySessionTelemetry = {
  maxHeartRateBpm: number | null;
  maxHeartRateSource?: "google_health_rollup" | "recorded_samples" | "none";
  heartRateSampleCount: number;
  heartRateSamples: Array<{ measuredAt: string; bpm: number }>;
  heartRateSamplesDownsampled: boolean;
  heartRateSampleSource: "health_records" | "google_health_api" | "none";
  heartRateFetchLimited: boolean;
  heartRateFetchStatus: "not_needed" | "fetched" | "empty" | "unavailable" | "failed";
  coverage: {
    sessionSeconds: number;
    activeSeconds: number;
    observedSeconds: number;
    percent: number | null;
    pauseDataAvailable: boolean;
    pauses: Array<{ startTime: string; endTime: string; seconds: number }>;
    gaps: Array<{ startTime: string; endTime: string; seconds: number }>;
    gapCount: number;
    omittedGapCount: number;
  };
  calculatedZones: null | {
    method: "percent_max_heart_rate";
    thresholdSource: "soma_max_heart_rate";
    maximumHeartRate: MaximumHeartRate;
    seconds: Record<HeartRateZoneName, number>;
    belowZoneSeconds: number;
    aboveMaximumSeconds: number;
    classifiedSeconds: number;
    observedSeconds: number;
    thresholdCoveragePercent: number | null;
    complete: boolean;
  };
};

const MAX_CONTIGUOUS_SAMPLE_GAP_SECONDS = 15;
const MAX_RETURNED_INTERVALS = 50;
const MAX_RETURNED_SAMPLES = 10_000;

type Interval = { start: number; end: number };
type HeartRateSample = { timestamp: number; bpm: number };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function findNumbers(value: unknown, key: string, output: number[] = []) {
  if (Array.isArray(value)) {
    for (const item of value) findNumbers(item, key, output);
    return output;
  }
  if (!isObject(value)) return output;
  const number = finiteNumber(value[key]);
  if (number !== null) output.push(number);
  for (const child of Object.values(value)) findNumbers(child, key, output);
  return output;
}

function sampleBpm(payload: unknown) {
  return findNumbers(payload, "beatsPerMinute").find((value) => value > 0 && value <= 300) ?? null;
}

function eventList(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) {
    if (payload.some((item) => isObject(item) && "eventTime" in item && "exerciseEventType" in item)) return payload;
    for (const item of payload) {
      const found = eventList(item);
      if (found) return found;
    }
    return null;
  }
  if (!isObject(payload)) return null;
  for (const child of Object.values(payload)) {
    const found = eventList(child);
    if (found) return found;
  }
  return null;
}

function clampInterval(interval: Interval, bounds: Interval): Interval | null {
  const start = Math.max(interval.start, bounds.start);
  const end = Math.min(interval.end, bounds.end);
  return end > start ? { start, end } : null;
}

function mergeIntervals(intervals: Interval[]) {
  const sorted = intervals.filter((interval) => interval.end > interval.start).sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (!previous || interval.start > previous.end) merged.push({ ...interval });
    else previous.end = Math.max(previous.end, interval.end);
  }
  return merged;
}

function pauseIntervals(payloads: unknown[], bounds: Interval) {
  const allEvents = payloads.flatMap((payload) => eventList(payload) ?? []);
  const events = allEvents.flatMap((event) => {
    if (!isObject(event) || typeof event.eventTime !== "string") return [];
    const timestamp = Date.parse(event.eventTime);
    return Number.isFinite(timestamp) ? [{ timestamp, type: String(event.exerciseEventType ?? "").toUpperCase() }] : [];
  }).sort((a, b) => a.timestamp - b.timestamp);
  const available = events.length > 0;
  const pauses: Interval[] = [];
  let pauseStart: number | null = null;
  for (const event of events) {
    if ((event.type === "PAUSE" || event.type === "AUTO_PAUSE") && pauseStart === null) {
      pauseStart = event.timestamp;
    } else if (event.type === "RESUME" || event.type === "AUTO_RESUME" || event.type === "STOP") {
      if (pauseStart !== null) {
        const bounded = clampInterval({ start: pauseStart, end: event.timestamp }, bounds);
        if (bounded) pauses.push(bounded);
        pauseStart = null;
      }
    }
  }
  if (pauseStart !== null) {
    const bounded = clampInterval({ start: pauseStart, end: bounds.end }, bounds);
    if (bounded) pauses.push(bounded);
  }
  return { available, intervals: mergeIntervals(pauses) };
}

function subtractIntervals(intervals: Interval[], exclusions: Interval[]) {
  let remaining = [...intervals];
  for (const exclusion of exclusions) {
    remaining = remaining.flatMap((interval) => {
      if (exclusion.end <= interval.start || exclusion.start >= interval.end) return [interval];
      const parts: Interval[] = [];
      if (exclusion.start > interval.start) parts.push({ start: interval.start, end: exclusion.start });
      if (exclusion.end < interval.end) parts.push({ start: exclusion.end, end: interval.end });
      return parts;
    });
  }
  return remaining;
}

function intervalSeconds(intervals: Interval[]) {
  return intervals.reduce((total, interval) => total + (interval.end - interval.start) / 1000, 0);
}

function serializeIntervals(intervals: Interval[]) {
  return intervals.map((interval) => ({
    startTime: new Date(interval.start).toISOString(),
    endTime: new Date(interval.end).toISOString(),
    seconds: (interval.end - interval.start) / 1000,
  }));
}

export function calculateActivitySessionTelemetry(input: ActivitySessionTelemetryInput): ActivitySessionTelemetry {
  const sessionStart = Date.parse(input.startTime);
  const sessionEnd = Date.parse(input.endTime);
  if (!Number.isFinite(sessionStart) || !Number.isFinite(sessionEnd) || sessionEnd <= sessionStart) {
    throw new Error("Activity session telemetry requires a valid time range.");
  }
  const bounds = { start: sessionStart, end: sessionEnd };
  const sessionSeconds = (sessionEnd - sessionStart) / 1000;

  const samples = input.heartRateRecords.flatMap((record): HeartRateSample[] => {
    const timestamp = record.measuredAt ? Date.parse(record.measuredAt) : Number.NaN;
    const bpm = sampleBpm(record.payload);
    if (!Number.isFinite(timestamp) || timestamp < sessionStart || timestamp > sessionEnd || bpm === null) return [];
    return [{ timestamp, bpm }];
  }).sort((a, b) => a.timestamp - b.timestamp);
  const deduplicatedSamples = samples.filter((sample, index) => index === 0 || sample.timestamp !== samples[index - 1]!.timestamp || sample.bpm !== samples[index - 1]!.bpm);
  const pauseResult = pauseIntervals(input.exercisePayloads ?? [], bounds);
  const activeIntervals = subtractIntervals([bounds], pauseResult.intervals);
  const activeSeconds = intervalSeconds(activeIntervals);

  const observedIntervals: Interval[] = [];
  const observedPieces: Array<{ interval: Interval; bpm: number }> = [];
  for (let index = 0; index + 1 < deduplicatedSamples.length; index += 1) {
    const current = deduplicatedSamples[index]!;
    const next = deduplicatedSamples[index + 1]!;
    const gapSeconds = (next.timestamp - current.timestamp) / 1000;
    if (gapSeconds <= 0 || gapSeconds > MAX_CONTIGUOUS_SAMPLE_GAP_SECONDS) continue;
    const interval = { start: current.timestamp, end: next.timestamp };
    const activePieces = subtractIntervals([interval], pauseResult.intervals);
    observedIntervals.push(...activePieces);
    observedPieces.push(...activePieces.map((piece) => ({ interval: piece, bpm: current.bpm })));
  }
  const observedMerged = mergeIntervals(observedIntervals);
  const observedSeconds = intervalSeconds(observedMerged);
  const gaps = subtractIntervals(activeIntervals, observedMerged);

  const maximumHeartRate = input.maximumHeartRate
    && Number.isInteger(input.maximumHeartRate.bpm)
    && input.maximumHeartRate.bpm >= 80
    && input.maximumHeartRate.bpm <= 250
    && (input.maximumHeartRate.source === "personal" || input.maximumHeartRate.source === "age_estimate")
    ? input.maximumHeartRate
    : null;
  const zoneSeconds: Record<HeartRateZoneName, number> = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
  let belowZoneSeconds = 0;
  let aboveMaximumSeconds = 0;
  let classifiedSeconds = 0;
  for (const piece of observedPieces) {
    if (!maximumHeartRate) continue;
    const classification = classifyPercentMaxHeartRate(piece.bpm, maximumHeartRate.bpm);
    if (!classification) continue;
    const seconds = (piece.interval.end - piece.interval.start) / 1000;
    if (classification.zone) zoneSeconds[classification.zone] += seconds;
    else if (classification.belowZone) belowZoneSeconds += seconds;
    else if (classification.aboveMaximum) aboveMaximumSeconds += seconds;
    classifiedSeconds += seconds;
  }

  const hasClassifiableObservedIntervals = Boolean(maximumHeartRate) && observedSeconds > 0;
  const heartRateSamplesDownsampled = deduplicatedSamples.length > MAX_RETURNED_SAMPLES;
  const returnedSamples = heartRateSamplesDownsampled
    ? Array.from({ length: MAX_RETURNED_SAMPLES }, (_, index) => {
      const sourceIndex = Math.round(index * (deduplicatedSamples.length - 1) / (MAX_RETURNED_SAMPLES - 1));
      return deduplicatedSamples[sourceIndex]!;
    })
    : deduplicatedSamples;

  return {
    maxHeartRateBpm: deduplicatedSamples.reduce<number | null>((maximum, sample) => maximum === null ? sample.bpm : Math.max(maximum, sample.bpm), null),
    heartRateSampleCount: deduplicatedSamples.length,
    heartRateSamples: returnedSamples.map((sample) => ({ measuredAt: new Date(sample.timestamp).toISOString(), bpm: sample.bpm })),
    heartRateSamplesDownsampled,
    heartRateSampleSource: input.heartRateSampleSource ?? (deduplicatedSamples.length ? "health_records" : "none"),
    heartRateFetchLimited: input.heartRateFetchLimited ?? false,
    heartRateFetchStatus: input.heartRateFetchStatus ?? (deduplicatedSamples.length ? "not_needed" : "unavailable"),
    coverage: {
      sessionSeconds,
      activeSeconds,
      observedSeconds,
      percent: activeSeconds > 0 ? (observedSeconds / activeSeconds) * 100 : null,
      pauseDataAvailable: pauseResult.available,
      pauses: serializeIntervals(pauseResult.intervals),
      gaps: serializeIntervals(gaps.slice(0, MAX_RETURNED_INTERVALS)),
      gapCount: gaps.length,
      omittedGapCount: Math.max(0, gaps.length - MAX_RETURNED_INTERVALS),
    },
    calculatedZones: hasClassifiableObservedIntervals && maximumHeartRate ? {
      method: "percent_max_heart_rate",
      thresholdSource: "soma_max_heart_rate",
      maximumHeartRate,
      seconds: zoneSeconds,
      belowZoneSeconds,
      aboveMaximumSeconds,
      classifiedSeconds,
      observedSeconds,
      thresholdCoveragePercent: observedSeconds > 0 ? (classifiedSeconds / observedSeconds) * 100 : null,
      complete: observedSeconds > 0 && Math.abs(classifiedSeconds - observedSeconds) < 0.001,
    } : null,
  };
}
