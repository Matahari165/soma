export type HeartRateZoneName = "light" | "moderate" | "vigorous" | "peak";

export type ActivitySessionTelemetryInput = {
  startTime: string;
  endTime: string;
  date?: string | null;
  timeZone?: string;
  heartRateRecords: Array<{
    measuredAt: string | null;
    civilDate?: string | null;
    sourceRecordId?: string | null;
    payload: unknown;
  }>;
  dailyZoneRecords: Array<{ civilDate: string | null; payload: unknown }>;
  exercisePayloads?: unknown[];
  heartRateSampleSource?: ActivitySessionTelemetry["heartRateSampleSource"];
  heartRateFetchLimited?: boolean;
  heartRateFetchStatus?: ActivitySessionTelemetry["heartRateFetchStatus"];
  zoneThresholdFetchStatus?: ActivitySessionTelemetry["zoneThresholdFetchStatus"];
  zoneThresholdFetchLimited?: boolean;
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
  zoneThresholdFetchStatus: "stored" | "fetched" | "unavailable" | "failed";
  zoneThresholdFetchLimited: boolean;
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
    source: "calculated_from_heart_rate_samples";
    thresholdSource: "google_daily_heart_rate_zones";
    seconds: Record<HeartRateZoneName, number>;
    classifiedSeconds: number;
    observedSeconds: number;
    thresholdCoveragePercent: number | null;
    complete: boolean;
  };
};

const MAX_CONTIGUOUS_SAMPLE_GAP_SECONDS = 15;
const MAX_RETURNED_INTERVALS = 50;
const MAX_RETURNED_SAMPLES = 10_000;
const ZONE_NAMES: HeartRateZoneName[] = ["light", "moderate", "vigorous", "peak"];
const ZONE_TYPES: Record<string, HeartRateZoneName> = {
  LIGHT: "light",
  MODERATE: "moderate",
  VIGOROUS: "vigorous",
  PEAK: "peak",
};

type Interval = { start: number; end: number };
type HeartRateSample = { timestamp: number; bpm: number; date: string | null };
type ZoneThreshold = { name: HeartRateZoneName; minimum: number; maximum: number };

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

function findArrays(value: unknown, key: string, output: unknown[][] = []) {
  if (Array.isArray(value)) {
    for (const item of value) findArrays(item, key, output);
    return output;
  }
  if (!isObject(value)) return output;
  if (Array.isArray(value[key])) output.push(value[key] as unknown[]);
  for (const child of Object.values(value)) findArrays(child, key, output);
  return output;
}

function sampleBpm(payload: unknown) {
  return findNumbers(payload, "beatsPerMinute").find((value) => value > 0 && value <= 300) ?? null;
}

function dateInTimeZone(timestamp: number, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(timestamp));
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
    const year = part("year");
    const month = part("month");
    const day = part("day");
    return year && month && day ? `${year}-${month}-${day}` : new Date(timestamp).toISOString().slice(0, 10);
  } catch {
    return new Date(timestamp).toISOString().slice(0, 10);
  }
}

function thresholdsFromPayload(payload: unknown): ZoneThreshold[] | null {
  const zoneArrays = findArrays(payload, "heartRateZones");
  for (const rawZones of zoneArrays) {
    const thresholds: ZoneThreshold[] = [];
    for (const rawZone of rawZones) {
      if (!isObject(rawZone)) continue;
      const name = ZONE_TYPES[String(rawZone.heartRateZoneType ?? "").toUpperCase()];
      const minimum = finiteNumber(rawZone.minBeatsPerMinute);
      const maximum = finiteNumber(rawZone.maxBeatsPerMinute);
      if (!name || minimum === null || maximum === null || minimum < 0 || maximum > 300 || minimum > maximum) continue;
      thresholds.push({ name, minimum, maximum });
    }
    if (thresholds.length !== ZONE_NAMES.length || new Set(thresholds.map((zone) => zone.name)).size !== ZONE_NAMES.length) continue;
    thresholds.sort((a, b) => a.minimum - b.minimum);
    if (thresholds.some((zone, index) => index > 0 && zone.minimum <= thresholds[index - 1]!.maximum)) continue;
    return thresholds;
  }
  return null;
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

function classifyHeartRate(bpm: number, thresholds: ZoneThreshold[]) {
  return thresholds.find((zone) => bpm >= zone.minimum && bpm <= zone.maximum)?.name ?? null;
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
    return [{ timestamp, bpm, date: record.civilDate ?? null }];
  }).sort((a, b) => a.timestamp - b.timestamp);
  const deduplicatedSamples = samples.filter((sample, index) => index === 0 || sample.timestamp !== samples[index - 1]!.timestamp || sample.bpm !== samples[index - 1]!.bpm);
  const pauseResult = pauseIntervals(input.exercisePayloads ?? [], bounds);
  const activeIntervals = subtractIntervals([bounds], pauseResult.intervals);
  const activeSeconds = intervalSeconds(activeIntervals);

  const observedIntervals: Interval[] = [];
  const observedPieces: Array<{ interval: Interval; bpm: number; date: string | null }> = [];
  for (let index = 0; index + 1 < deduplicatedSamples.length; index += 1) {
    const current = deduplicatedSamples[index]!;
    const next = deduplicatedSamples[index + 1]!;
    const gapSeconds = (next.timestamp - current.timestamp) / 1000;
    if (gapSeconds <= 0 || gapSeconds > MAX_CONTIGUOUS_SAMPLE_GAP_SECONDS) continue;
    const interval = { start: current.timestamp, end: next.timestamp };
    const activePieces = subtractIntervals([interval], pauseResult.intervals);
    observedIntervals.push(...activePieces);
    observedPieces.push(...activePieces.map((piece) => ({ interval: piece, bpm: current.bpm, date: current.date })));
  }
  const observedMerged = mergeIntervals(observedIntervals);
  const observedSeconds = intervalSeconds(observedMerged);
  const gaps = subtractIntervals(activeIntervals, observedMerged);

  const thresholdByDate = new Map<string, ZoneThreshold[]>();
  for (const record of input.dailyZoneRecords) {
    if (!record.civilDate) continue;
    const thresholds = thresholdsFromPayload(record.payload);
    if (thresholds) thresholdByDate.set(record.civilDate, thresholds);
  }

  const zoneSeconds: Record<HeartRateZoneName, number> = { light: 0, moderate: 0, vigorous: 0, peak: 0 };
  let classifiedSeconds = 0;
  for (const piece of observedPieces) {
    const localDate = piece.date ?? dateInTimeZone(piece.interval.start, input.timeZone ?? "Europe/Paris");
    const thresholds = thresholdByDate.get(localDate) ?? (input.date ? thresholdByDate.get(input.date) : undefined);
    if (!thresholds) continue;
    const zone = classifyHeartRate(piece.bpm, thresholds);
    if (!zone) continue;
    const seconds = (piece.interval.end - piece.interval.start) / 1000;
    zoneSeconds[zone] += seconds;
    classifiedSeconds += seconds;
  }

  const hasThresholdsForAnyObservedInterval = observedPieces.some((piece) => {
    const localDate = piece.date ?? dateInTimeZone(piece.interval.start, input.timeZone ?? "Europe/Paris");
    return Boolean(thresholdByDate.get(localDate) ?? (input.date ? thresholdByDate.get(input.date) : undefined));
  });
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
    zoneThresholdFetchStatus: input.zoneThresholdFetchStatus ?? (thresholdByDate.size ? "stored" : "unavailable"),
    zoneThresholdFetchLimited: input.zoneThresholdFetchLimited ?? false,
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
    calculatedZones: hasThresholdsForAnyObservedInterval ? {
      source: "calculated_from_heart_rate_samples",
      thresholdSource: "google_daily_heart_rate_zones",
      seconds: zoneSeconds,
      classifiedSeconds,
      observedSeconds,
      thresholdCoveragePercent: observedSeconds > 0 ? (classifiedSeconds / observedSeconds) * 100 : null,
      complete: observedSeconds > 0 && Math.abs(classifiedSeconds - observedSeconds) < 0.001,
    } : null,
  };
}

export function activitySessionZoneDates(input: {
  startTime: string;
  endTime: string;
  date?: string | null;
  timeZone?: string;
}) {
  const start = Date.parse(input.startTime);
  const end = Date.parse(input.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const timeZone = input.timeZone ?? "Europe/Paris";
  const dates = new Set<string>();
  if (input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date)) dates.add(input.date);
  dates.add(dateInTimeZone(start, timeZone));
  dates.add(dateInTimeZone(end, timeZone));
  return [...dates].filter(Boolean).sort();
}
