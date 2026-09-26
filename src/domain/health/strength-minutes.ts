import { activeHoursDayWindow } from "./active-hours";
import type { NormalizedHealthRecord } from "./aggregate";

const STRENGTH_TYPES = new Set(["STRENGTH", "STRENGTH_TRAINING", "WEIGHT_TRAINING", "WEIGHTLIFTING", "WEIGHT_LIFTING", "CALISTHENICS", "BODYWEIGHT_TRAINING", "RESISTANCE_TRAINING", "FUNCTIONAL_STRENGTH_TRAINING", "WEIGHTS", "FREE_WEIGHTS", "WEIGHT_MACHINES", "POWERLIFTING"]);
function object(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function exercisePayload(value: unknown): Record<string, unknown> | null {
  const item = object(value);
  if (!item) return null;
  if (object(item.exercise)) return object(item.exercise);
  for (const child of Object.values(item)) { const result = exercisePayload(child); if (result) return result; }
  return null;
}

/** Recorded strengthening sessions only; a generic gym visit cannot establish its type. */
export function strengthMinutesForDate(records: readonly NormalizedHealthRecord[], date: string, timeZone: string, exerciseMinutes: number | null) {
  const window = activeHoursDayWindow(date, timeZone);
  const dayStart = Date.parse(window.start);
  const dayEnd = Date.parse(window.end);
  const intervals: [number, number][] = [];
  const seen = new Set<string>();
  let fallbackMinutes = 0;
  let found = false;
  for (const record of records) {
    if (record.data_type !== "exercise") continue;
    const exercise = exercisePayload(record.payload);
    const type = String(exercise?.exerciseType ?? "").replaceAll("-", "_").toUpperCase();
    if (!STRENGTH_TYPES.has(type)) continue;
    const interval = object(exercise?.interval);
    const start = Date.parse(record.start_time ?? String(interval?.startTime ?? ""));
    const end = Date.parse(record.end_time ?? String(interval?.endTime ?? ""));
    const identity = JSON.stringify([record.start_time, record.end_time, record.civil_date, exercise]);
    if (seen.has(identity)) continue;
    seen.add(identity);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      const clippedStart = Math.max(start, dayStart);
      const clippedEnd = Math.min(end, dayEnd);
      if (clippedEnd > clippedStart) { found = true; intervals.push([clippedStart, clippedEnd]); }
    } else if (record.civil_date === date) {
      found = true;
      const duration = Number(String(exercise?.duration ?? exercise?.activeDuration ?? "").replace(/s$/, ""));
      if (!Number.isFinite(duration) || duration <= 0) return null;
      fallbackMinutes += duration / 60;
    }
  }
  if (!found) return exerciseMinutes === null ? null : 0;
  intervals.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let coveredUntil = -Infinity;
  for (const [start, end] of intervals) { total += Math.max(0, end - Math.max(start, coveredUntil)); coveredUntil = Math.max(coveredUntil, end); }
  return total / 60_000 + fallbackMinutes;
}
