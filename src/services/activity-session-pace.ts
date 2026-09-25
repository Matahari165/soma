import "server-only";

import { createCloudflareAdminClient } from "@/lib/cloudflare/db";

const PAGE_SIZE = 1_000;
const MAX_DISTANCE_ROWS = 10_000;
const MAX_INTERVAL_SECONDS = 120;
const TIME_TOLERANCE_MS = 1;
const KILOMETER_MILLIMETERS = 1_000_000;
const MIN_PARTIAL_DISTANCE_MILLIMETERS = 50_000;

type SessionRange = { startTime: string; endTime: string };
type DistanceRecord = {
  source_record_id?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  payload?: unknown;
};
type DistanceInterval = { start: number; end: number; millimeters: number; sourceRecordId: string | null };

export type ActivitySessionPaceSplit = {
  index: number;
  startTime: string;
  endTime: string;
  distanceKm: number;
  durationSeconds: number;
  paceSecondsPerKm: number;
  source: "estimated_distance_records";
  estimated: true;
  partial: boolean;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validRange(range: SessionRange) {
  const start = Date.parse(range.startTime);
  const end = Date.parse(range.endTime);
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

function distanceIntervalFromRecord(record: DistanceRecord): DistanceInterval | null {
  const payload = isObject(record.payload) ? record.payload : null;
  const distance = payload && isObject(payload.distance) ? payload.distance : null;
  const interval = distance && isObject(distance.interval) ? distance.interval : null;
  const startValue = typeof interval?.startTime === "string" ? interval.startTime : record.start_time;
  const endValue = typeof interval?.endTime === "string" ? interval.endTime : record.end_time;
  const start = typeof startValue === "string" ? Date.parse(startValue) : Number.NaN;
  const end = typeof endValue === "string" ? Date.parse(endValue) : Number.NaN;
  const rawMillimeters = distance?.millimeters;
  const millimeters = typeof rawMillimeters === "number" || typeof rawMillimeters === "string"
    ? Number(rawMillimeters)
    : Number.NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start
    || !Number.isSafeInteger(millimeters) || millimeters < 0 || millimeters > 1_000_000_000) return null;

  if (record.start_time && Math.abs(Date.parse(record.start_time) - start) > TIME_TOLERANCE_MS) return null;
  if (record.end_time && Math.abs(Date.parse(record.end_time) - end) > TIME_TOLERANCE_MS) return null;
  return { start, end, millimeters, sourceRecordId: typeof record.source_record_id === "string" ? record.source_record_id : null };
}

function intervalIdentity(interval: DistanceInterval) {
  return `${interval.start}:${interval.end}:${interval.millimeters}`;
}

function uniqueIntervals(records: DistanceRecord[]): DistanceInterval[] | null {
  const bySourceId = new Map<string, DistanceInterval>();
  const identities = new Set<string>();
  const intervals: DistanceInterval[] = [];

  for (const record of records) {
    const interval = distanceIntervalFromRecord(record);
    if (!interval) return null;
    const identity = intervalIdentity(interval);
    if (interval.sourceRecordId) {
      const previous = bySourceId.get(interval.sourceRecordId);
      if (previous) {
        if (intervalIdentity(previous) !== identity) return null;
        continue;
      }
      bySourceId.set(interval.sourceRecordId, interval);
    }
    if (identities.has(identity)) continue;
    identities.add(identity);
    intervals.push(interval);
  }
  return intervals.sort((a, b) => a.start - b.start || a.end - b.end || (a.sourceRecordId ?? "").localeCompare(b.sourceRecordId ?? ""));
}

function appendSplit(
  output: ActivitySessionPaceSplit[],
  start: number,
  end: number,
  millimeters: number,
  partial: boolean,
) {
  const durationSeconds = (end - start) / 1000;
  const distanceKm = millimeters / KILOMETER_MILLIMETERS;
  if (durationSeconds <= 0 || distanceKm <= 0) return;
  output.push({
    index: output.length + 1,
    startTime: new Date(start).toISOString(),
    endTime: new Date(end).toISOString(),
    distanceKm,
    durationSeconds,
    paceSecondsPerKm: durationSeconds / distanceKm,
    source: "estimated_distance_records",
    estimated: true,
    partial,
  });
}

function estimateKilometerSplits(records: DistanceRecord[], sessionStart: number, sessionEnd: number): ActivitySessionPaceSplit[] {
  const intervals = uniqueIntervals(records);
  if (!intervals?.length) return [];

  const splits: ActivitySessionPaceSplit[] = [];
  const crossingTimes: number[] = [];
  let expectedStart = sessionStart;
  let cumulativeMillimeters = 0;
  let nextKilometer = KILOMETER_MILLIMETERS;
  let coveredSessionEnd = false;

  for (const interval of intervals) {
    const clippedStart = Math.max(interval.start, sessionStart);
    const clippedEnd = Math.min(interval.end, sessionEnd);
    if (clippedEnd <= clippedStart) continue;

    if (clippedStart > expectedStart + TIME_TOLERANCE_MS) break;
    if (clippedStart < expectedStart - TIME_TOLERANCE_MS) return [];

    const sourceIntervalSeconds = (interval.end - interval.start) / 1000;
    if (sourceIntervalSeconds > MAX_INTERVAL_SECONDS) break;
    const clippedDistance = interval.millimeters * ((clippedEnd - clippedStart) / (interval.end - interval.start));

    const distanceStart = cumulativeMillimeters;
    const distanceEnd = distanceStart + clippedDistance;
    while (clippedDistance > 0 && nextKilometer <= distanceEnd + 1e-6) {
      const distanceIntoInterval = nextKilometer - distanceStart;
      const fraction = Math.min(1, Math.max(0, distanceIntoInterval / clippedDistance));
      crossingTimes.push(clippedStart + fraction * (clippedEnd - clippedStart));
      nextKilometer += KILOMETER_MILLIMETERS;
    }
    cumulativeMillimeters = distanceEnd;
    expectedStart = clippedEnd;
    if (expectedStart >= sessionEnd - TIME_TOLERANCE_MS) {
      coveredSessionEnd = true;
      break;
    }
  }

  let splitStart = sessionStart;
  let splitDistanceStart = 0;
  for (const crossingTime of crossingTimes) {
    appendSplit(splits, splitStart, crossingTime, KILOMETER_MILLIMETERS, false);
    splitStart = crossingTime;
    splitDistanceStart += KILOMETER_MILLIMETERS;
  }

  const remainingDistance = cumulativeMillimeters - splitDistanceStart;
  if (coveredSessionEnd && remainingDistance >= MIN_PARTIAL_DISTANCE_MILLIMETERS && sessionEnd > splitStart) {
    appendSplit(splits, splitStart, sessionEnd, remainingDistance, true);
  }
  return splits;
}

async function readDistanceRecords(userId: string, startTime: string, endTime: string): Promise<DistanceRecord[] | null> {
  const admin = createCloudflareAdminClient();
  const records: DistanceRecord[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await admin.from("health_records")
      .select("source_record_id,start_time,end_time,payload")
      .eq("user_id", userId)
      .eq("provider", "google_health")
      .eq("data_type", "distance")
      .lt("start_time", endTime)
      .gt("end_time", startTime)
      .order("start_time", { ascending: true })
      .order("source_record_id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (result.error) return null;
    const page = (result.data ?? []) as DistanceRecord[];
    records.push(...page);
    if (records.length > MAX_DISTANCE_ROWS) return null;
    if (page.length < PAGE_SIZE) return records;
  }
}

/**
 * Estimates kilometer splits from Google Health distance intervals.
 * The caller should use these only when the exercise has no source distance splits.
 */
export async function getActivitySessionPace(
  userId: string,
  range: SessionRange,
): Promise<ActivitySessionPaceSplit[]> {
  if (!userId || !validRange(range)) return [];
  const start = Date.parse(range.startTime);
  const end = Date.parse(range.endTime);
  const [startTime, endTime] = [new Date(start).toISOString(), new Date(end).toISOString()];
  const records = await readDistanceRecords(userId, startTime, endTime);
  return records ? estimateKilometerSplits(records, start, end) : [];
}
