#!/usr/bin/env node

/**
 * Offline backfill for derived wearable metrics.
 *
 * Inputs are local exports only. The script never connects to D1 and is a
 * dry-run unless --generate-sql is explicitly provided. Candidate health
 * records are the normalized JSON emitted by the WHOOP and Google Takeout
 * normalizers; existing inputs may be direct JSON, JSONL, or soma_rows D1
 * wrappers containing json_data.
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export const TARGET_FIELDS = [
  "sedentary_minutes",
  "vo2_max",
  "running_distance_km",
  "running_duration_minutes",
  "running_pace_seconds_per_km",
  "running_average_heart_rate",
];

export const DEFAULT_CUTOFFS = {
  whoopThrough: "2026-05-28",
  googleFrom: "2026-05-29",
};

const FIELD_TOLERANCE = {
  sedentary_minutes: 0.01,
  vo2_max: 0.02,
  running_distance_km: 0.01,
  running_duration_minutes: 0.01,
  running_pace_seconds_per_km: 0.1,
  running_average_heart_rate: 0.1,
};

const STATUS_NAMES = ["new", "already_present", "conflict", "no_value", "invalid", "outside_cutoff", "duplicate"];

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function validTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? value : null;
}

function dateFromTimestamp(value, timeZone) {
  const timestamp = validTimestamp(value);
  if (!timestamp) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(timestamp));
  const part = (type) => parts.find((item) => item.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

export function recordDate(record, timeZone = "Europe/Paris") {
  return validDate(record?.civil_date) ?? dateFromTimestamp(record?.end_time ?? record?.start_time ?? record?.measured_at, timeZone);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (!isObject(value)) return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function equivalent(left, right) {
  return stableJson(left) === stableJson(right);
}

function findNumber(value, keys) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNumber(item, keys);
      if (found !== null) return found;
    }
    return null;
  }
  if (!isObject(value)) return null;
  for (const key of keys) {
    const found = number(value[key]);
    if (found !== null) return found;
  }
  for (const child of Object.values(value)) {
    const found = findNumber(child, keys);
    if (found !== null) return found;
  }
  return null;
}

function findNumbers(value, keys, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) findNumbers(item, keys, output);
    return output;
  }
  if (!isObject(value)) return output;
  for (const key of keys) {
    const found = number(value[key]);
    if (found !== null) output.push(found);
  }
  for (const child of Object.values(value)) findNumbers(child, keys, output);
  return output;
}

function findObject(value, key) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findObject(item, key);
      if (found) return found;
    }
    return null;
  }
  if (!isObject(value)) return null;
  if (isObject(value[key])) return value[key];
  for (const child of Object.values(value)) {
    const found = findObject(child, key);
    if (found) return found;
  }
  return null;
}

function durationMinutes(value) {
  if (typeof value === "number") return value / 60;
  if (typeof value !== "string") return null;
  const match = value.match(/^(-?\d+(?:\.\d+)?)s$/);
  return match ? Number(match[1]) / 60 : number(value);
}

function minutesBetween(start, end) {
  if (!start || !end) return null;
  const duration = (Date.parse(end) - Date.parse(start)) / 60_000;
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function total(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function directNumber(value, key) {
  return isObject(value) ? number(value[key]) : null;
}

function exerciseMetricNumber(payload, keys) {
  const exercise = findObject(payload, "exercise");
  const summary = isObject(exercise?.metricsSummary) ? exercise.metricsSummary : null;
  for (const key of keys) {
    const found = directNumber(summary, key);
    if (found !== null) return found;
  }
  return findNumber(payload, keys);
}

function exerciseDistanceMillimeters(payload) {
  const exercise = findObject(payload, "exercise");
  const summary = isObject(exercise?.metricsSummary) ? exercise.metricsSummary : null;
  const sessionDistance = directNumber(summary, "distanceMillimeters");
  if (sessionDistance !== null) return sessionDistance;
  const splitDistance = total(findNumbers(exercise?.splits, ["distanceMillimeters"]));
  return splitDistance ?? findNumber(payload, ["distanceMillimeters"]);
}

function sourceKind(record) {
  const provider = String(record?.provider ?? "").toLowerCase();
  const method = String(record?.recording_method ?? "").toLowerCase();
  const device = String(record?.source_device ?? "").toLowerCase();
  const payloadSource = findObject(record?.payload, "source");
  const sourceProvider = String(payloadSource?.provider ?? "").toLowerCase();
  if (provider.includes("whoop") || device.includes("whoop") || sourceProvider.includes("whoop")) return "whoop";
  if (sourceProvider.includes("takeout") || method.includes("takeout") || device.includes("fitbit")) return "google_takeout";
  if (provider.includes("google") || provider.includes("fit")) return "google_api";
  return "unknown";
}

function sourceCounts(records) {
  const counts = { whoop: 0, google_takeout: 0, google_api: 0, unknown: 0 };
  for (const record of records) counts[sourceKind(record)] += 1;
  return counts;
}

function recordIdentity(record) {
  return [record?.user_id ?? "", record?.provider ?? "", record?.data_type ?? "", record?.source_record_id ?? ""].join("|");
}

function eventMillis(value) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function roundedEvent(value) {
  const millis = eventMillis(value);
  return millis === null ? null : Math.round(millis / 60_000);
}

function exerciseType(record) {
  return String(findObject(record?.payload, "exercise")?.exerciseType ?? "").toUpperCase();
}

function metricValue(record, field) {
  if (field === "distance") return exerciseDistanceMillimeters(record.payload);
  if (field === "duration") return minutesBetween(record.start_time, record.end_time) ?? durationMinutes(findObject(record.payload, "exercise")?.duration ?? findObject(record.payload, "exercise")?.activeDuration);
  if (field === "heartRate") return exerciseMetricNumber(record.payload, ["averageHeartRateBeatsPerMinute", "averageHeartRate"]);
  if (field === "vo2") return findNumber(record.payload, ["vo2Max", "runVo2Max", "filteredVo2Max", "filteredRunVO2Max", "filteredDemographicVO2Max", "demographicVO2Max"]);
  if (field === "sedentary") {
    const direct = minutesBetween(record.start_time, record.end_time);
    if (direct !== null) return direct;
    const locate = (value) => {
      if (Array.isArray(value)) {
        for (const item of value) { const found = locate(item); if (found !== null) return found; }
        return null;
      }
      if (!isObject(value)) return null;
      if (value.durationSum !== undefined) return durationMinutes(value.durationSum);
      for (const child of Object.values(value)) { const found = locate(child); if (found !== null) return found; }
      return null;
    };
    return locate(record.payload);
  }
  return null;
}

function semanticFamily(record) {
  if (record?.data_type === "exercise") return "exercise";
  if (["run-vo2-max", "vo2-max"].includes(record?.data_type)) return "vo2-event";
  if (record?.data_type === "daily-vo2-max") return "daily-vo2-max";
  if (record?.data_type === "sedentary-period") return "sedentary-period";
  return String(record?.data_type ?? "unknown");
}

function semanticBucket(record, timeZone = "Europe/Paris") {
  const family = semanticFamily(record);
  const date = recordDate(record, timeZone) ?? "unknown-date";
  if (family === "exercise") return `${family}|${date}|${exerciseType(record)}`;
  if (family === "vo2-event") return `${family}|${date}|${roundedEvent(record.measured_at ?? record.start_time ?? record.end_time) ?? "unknown-time"}`;
  if (family === "sedentary-period") return `${family}|${date}|${roundedEvent(record.start_time) ?? "unknown-start"}|${roundedEvent(record.end_time) ?? "unknown-end"}`;
  return `${family}|${date}`;
}

function semanticRelation(first, second, timeZone = "Europe/Paris") {
  const family = semanticFamily(first);
  if (family !== semanticFamily(second) || recordDate(first, timeZone) !== recordDate(second, timeZone)) return null;
  if (family === "exercise") {
    if (!exerciseType(first) || exerciseType(first) !== exerciseType(second)) return null;
    const starts = eventMillis(first.start_time), otherStarts = eventMillis(second.start_time);
    const ends = eventMillis(first.end_time), otherEnds = eventMillis(second.end_time);
    if (starts === null || otherStarts === null || ends === null || otherEnds === null || Math.abs(starts - otherStarts) > 60_000 || Math.abs(ends - otherEnds) > 60_000) return null;
    if (!close(metricValue(first, "duration"), metricValue(second, "duration"), 1)) return "conflict";
    if (!close(metricValue(first, "distance"), metricValue(second, "distance"), 10_000)) return "conflict";
    if (!close(metricValue(first, "heartRate"), metricValue(second, "heartRate"), 2)) return "conflict";
    return "equal";
  }
  if (family === "vo2-event") {
    const firstTime = eventMillis(first.measured_at ?? first.start_time ?? first.end_time);
    const secondTime = eventMillis(second.measured_at ?? second.start_time ?? second.end_time);
    if (firstTime === null || secondTime === null || Math.abs(firstTime - secondTime) > 5 * 60_000) return null;
    return close(metricValue(first, "vo2"), metricValue(second, "vo2"), 0.02) ? "equal" : "conflict";
  }
  if (family === "daily-vo2-max") return close(metricValue(first, "vo2"), metricValue(second, "vo2"), 0.02) ? "equal" : "conflict";
  if (family === "sedentary-period") {
    const firstStart = eventMillis(first.start_time), secondStart = eventMillis(second.start_time);
    const firstEnd = eventMillis(first.end_time), secondEnd = eventMillis(second.end_time);
    if (firstStart !== null && secondStart !== null && firstEnd !== null && secondEnd !== null && (Math.abs(firstStart - secondStart) > 60_000 || Math.abs(firstEnd - secondEnd) > 60_000)) return null;
    return close(metricValue(first, "sedentary"), metricValue(second, "sedentary"), 1) ? "equal" : "conflict";
  }
  return "equal";
}

function close(first, second, tolerance) {
  return first === null || second === null ? equivalent(first, second) : Math.abs(first - second) <= tolerance;
}

function mergePayload(existing, candidate, conflicts = [], path = "payload") {
  if (equivalent(existing, candidate)) return existing;
  if (isObject(existing) && isObject(candidate)) {
    const merged = { ...existing };
    for (const [key, value] of Object.entries(candidate)) {
      if (!(key in existing)) merged[key] = value;
      else merged[key] = mergePayload(existing[key], value, conflicts, `${path}.${key}`);
    }
    return merged;
  }
  if (Array.isArray(existing) || Array.isArray(candidate)) {
    conflicts.push(path);
    return existing;
  }
  if (existing === null || existing === undefined) return candidate;
  if (candidate === null || candidate === undefined) return existing;
  conflicts.push(path);
  return existing;
}

function mergeRecords(existing, candidate) {
  const conflicts = [];
  const merged = { ...existing, ...candidate };
  merged.payload = mergePayload(existing.payload, candidate.payload, conflicts);
  return { merged, conflicts };
}

function unwrapRows(value, expectedTable, inheritedUserId = null) {
  if (Array.isArray(value)) return value.flatMap((item) => unwrapRows(item, expectedTable, inheritedUserId));
  if (!isObject(value)) return [];
  if (typeof value.json_data === "string") {
    let parsed;
    try { parsed = JSON.parse(value.json_data); } catch { return []; }
    if (!isObject(parsed)) return [];
    if (value.table_name && value.table_name !== expectedTable) return [];
    const row = value.user_id && !parsed.user_id ? { ...parsed, user_id: value.user_id } : parsed;
    return unwrapRows(row, expectedTable, inheritedUserId);
  }
  if (value.table_name && value.table_name !== expectedTable) return [];
  if (Array.isArray(value[expectedTable])) return value[expectedTable].flatMap((item) => unwrapRows(item, expectedTable, value.user_id ?? inheritedUserId));
  if (typeof value[expectedTable === "health_records" ? "data_type" : "metric_date"] === "string") {
    return [value.user_id ? value : inheritedUserId ? { ...value, user_id: inheritedUserId } : value];
  }
  if (Array.isArray(value.results)) return value.results.flatMap((item) => unwrapRows(item, expectedTable, inheritedUserId));
  if (Array.isArray(value.rows)) return value.rows.flatMap((item) => unwrapRows(item, expectedTable, inheritedUserId));
  return [];
}

export function parseRowsText(source, expectedTable) {
  const trimmed = String(source ?? "").trim();
  if (!trimmed) return [];
  try { return unwrapRows(JSON.parse(trimmed), expectedTable); } catch {
    return trimmed.split(/\r?\n/).flatMap((line) => {
      try { return unwrapRows(JSON.parse(line), expectedTable); } catch { return []; }
    });
  }
}

export async function readRows(path, expectedTable) {
  return parseRowsText(await readFile(resolve(path), "utf8"), expectedTable);
}

function validateCandidate(record, configuration) {
  if (!isObject(record) || typeof record.data_type !== "string" || !record.data_type || typeof record.source_record_id !== "string" || !record.source_record_id) return "invalid";
  const date = recordDate(record, configuration.timeZone);
  if (!date || !record.provider) return "invalid";
  const kind = sourceKind(record);
  if (kind === "unknown" || kind === "google_api") return "invalid";
  if (kind === "whoop" && date > configuration.whoopThrough) return "outside_cutoff";
  if (kind === "google_takeout" && date < configuration.googleFrom) return "outside_cutoff";
  return null;
}

function emptyStatusCounts() {
  return Object.fromEntries(STATUS_NAMES.map((status) => [status, 0]));
}

function emptyFieldCounts() {
  return { candidateValues: 0, new: 0, alreadyPresent: 0, conflict: 0 };
}

function derivedForDate(day) {
  const byType = (type) => day.filter((record) => record.data_type === type);
  const runningExercises = byType("exercise").filter((record) => ["RUNNING", "JOGGING", "TRAIL_RUNNING"].includes(exerciseType(record)));
  const runningDistances = runningExercises.map((record) => {
    const millimeters = exerciseDistanceMillimeters(record.payload);
    return millimeters === null ? null : millimeters / 1_000_000;
  }).filter((value) => value !== null);
  const runningDurations = runningExercises.map((record) => metricValue(record, "duration")).filter((value) => value !== null);
  const paceObservations = runningExercises.map((record) => ({
    distance: (() => {
      const millimeters = exerciseDistanceMillimeters(record.payload);
      return millimeters === null ? null : millimeters / 1_000_000;
    })(),
    duration: metricValue(record, "duration"),
  })).filter((item) => item.distance !== null && item.distance > 0 && item.duration !== null && item.duration > 0);
  const heartRateValues = runningExercises.map((record) => metricValue(record, "heartRate")).filter((value) => value !== null);
  const heartRateObservations = runningExercises.map((record) => ({ heartRate: metricValue(record, "heartRate"), duration: metricValue(record, "duration") })).filter((item) => item.heartRate !== null && item.duration !== null && item.duration > 0);
  const weightedDuration = total(heartRateObservations.map((item) => item.duration));
  const distance = total(runningDistances);
  const duration = total(runningDurations);
  const paceDistance = total(paceObservations.map((item) => item.distance));
  const paceDuration = total(paceObservations.map((item) => item.duration));
  const sedentary = total(byType("sedentary-period").map((record) => metricValue(record, "sedentary")).filter((value) => value !== null));
  const vo2 = average([
    ...byType("daily-vo2-max").map((record) => findNumber(record.payload, ["vo2Max", "runVo2Max"])).filter((value) => value !== null),
    ...byType("vo2-max").map((record) => findNumber(record.payload, ["vo2Max"])).filter((value) => value !== null),
    ...byType("run-vo2-max").map((record) => findNumber(record.payload, ["runVo2Max"])).filter((value) => value !== null),
  ]);
  return {
    sedentary_minutes: sedentary,
    vo2_max: vo2,
    running_distance_km: distance,
    running_duration_minutes: duration,
    running_pace_seconds_per_km: paceDistance !== null && paceDistance > 0 && paceDuration !== null ? paceDuration * 60 / paceDistance : null,
    running_average_heart_rate: weightedDuration !== null && weightedDuration > 0
      ? heartRateObservations.reduce((sum, item) => sum + item.heartRate * item.duration, 0) / weightedDuration
      : average(heartRateValues),
  };
}

function metricKey(row, fallbackUserId) {
  const userId = row?.user_id ?? fallbackUserId ?? "";
  return `${userId}|${row?.metric_date ?? ""}`;
}

function valueEqual(field, first, second) {
  const left = number(first), right = number(second);
  return left !== null && right !== null && Math.abs(left - right) <= FIELD_TOLERANCE[field];
}

function identityRowKey(userId, metricDate) {
  return encodeURIComponent(JSON.stringify([["user_id", userId], ["metric_date", metricDate]]));
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function metricInsertRow(userId, date, values, now) {
  return { user_id: userId, metric_date: date, ...values, created_at: now, updated_at: now };
}

function buildMetricSql(userId, date, values, now) {
  const row = metricInsertRow(userId, date, values, now);
  const json = JSON.stringify(row);
  const paths = TARGET_FIELDS.filter((field) => values[field] !== null && values[field] !== undefined);
  const pathArgs = paths.flatMap((field) => [`'$.${field}'`, `json_extract(excluded.json_data, '$.${field}')`]);
  const changed = paths.map((field) => `(json_extract(soma_rows.json_data, '$.${field}') IS NULL)`).join(" OR ");
  const update = `json_set(soma_rows.json_data, ${[...pathArgs, "'$.updated_at'", "excluded.updated_at"].join(", ")})`;
  return `INSERT INTO soma_rows (table_name,row_key,user_id,json_data,created_at,updated_at) VALUES (${sqlLiteral("daily_health_metrics")},${sqlLiteral(identityRowKey(userId, date))},${sqlLiteral(userId)},${sqlLiteral(json)},${sqlLiteral(now)},${sqlLiteral(now)}) ON CONFLICT(table_name,row_key) DO UPDATE SET json_data=${update},updated_at=excluded.updated_at WHERE ${changed};`;
}

export function buildSql(plan, options = {}) {
  if (!options.generateSql) throw new Error("SQL generation requires generateSql: true.");
  const now = options.now ?? new Date().toISOString();
  const statements = [];
  let sqlRows = 0;
  for (const row of plan.rows) {
    if (!row.writeValues || !Object.keys(row.writeValues).length) continue;
    statements.push(buildMetricSql(plan.userId, row.metric_date, row.writeValues, now));
    sqlRows += 1;
  }
  return { sql: statements.length ? `${statements.join("\n")}\n` : "", sqlRows };
}

export function buildPlan({ candidates = [], existingRecords = [], existingMetrics = [], userId, timeZone = "Europe/Paris", whoopThrough = DEFAULT_CUTOFFS.whoopThrough, googleFrom = DEFAULT_CUTOFFS.googleFrom } = {}) {
  const effectiveUserId = userId ?? existingRecords.find((record) => typeof record.user_id === "string" && record.user_id)?.user_id ?? existingMetrics.find((record) => typeof record.user_id === "string" && record.user_id)?.user_id ?? candidates.find((record) => typeof record.user_id === "string" && record.user_id)?.user_id ?? "";
  if (!effectiveUserId) throw new Error("A user_id is required or must be inferable from the input rows.");
  const configuration = { userId: effectiveUserId, timeZone, whoopThrough, googleFrom };
  const normalizedExisting = existingRecords.map((record) => effectiveUserId && !record.user_id ? { ...record, user_id: effectiveUserId } : record);
  const normalizedCandidates = candidates.map((record) => effectiveUserId && !record.user_id ? { ...record, user_id: effectiveUserId } : record);
  const statuses = emptyStatusCounts();
  const fieldCounts = Object.fromEntries(TARGET_FIELDS.map((field) => [field, emptyFieldCounts()]));
  const existingByIdentity = new Map(normalizedExisting.map((record) => [recordIdentity(record), record]));
  const allRecords = [...existingByIdentity.values()];
  const semanticIndex = new Map();
  for (const record of allRecords) {
    const bucket = semanticBucket(record, timeZone);
    semanticIndex.set(bucket, [...(semanticIndex.get(bucket) ?? []), record]);
  }
  const acceptedCandidates = [];
  const candidateStatus = [];
  for (const candidate of normalizedCandidates) {
    const invalid = validateCandidate(candidate, configuration);
    if (invalid) { statuses[invalid] += 1; candidateStatus.push(invalid); continue; }
    const identity = recordIdentity(candidate);
    const exact = existingByIdentity.get(identity) ?? acceptedCandidates.find((record) => recordIdentity(record) === identity);
    if (exact) {
      const merged = mergeRecords(exact, candidate);
      if (merged.conflicts.length) { statuses.conflict += 1; candidateStatus.push("conflict"); continue; }
      const index = allRecords.indexOf(exact);
      if (index >= 0) allRecords[index] = merged.merged;
      const bucket = semanticBucket(exact, timeZone);
      const bucketRows = semanticIndex.get(bucket) ?? [];
      const bucketIndex = bucketRows.indexOf(exact);
      if (bucketIndex >= 0) bucketRows[bucketIndex] = merged.merged;
      semanticIndex.set(bucket, bucketRows);
      existingByIdentity.set(identity, merged.merged);
      const candidateIndex = acceptedCandidates.indexOf(exact);
      if (candidateIndex >= 0) acceptedCandidates[candidateIndex] = merged.merged;
      statuses.duplicate += 1;
      candidateStatus.push("duplicate");
      continue;
    }
    let semanticMatch = null;
    for (const record of semanticIndex.get(semanticBucket(candidate, timeZone)) ?? []) {
      const relation = semanticRelation(candidate, record, timeZone);
      if (relation) { semanticMatch = { record, relation }; break; }
    }
    if (semanticMatch?.relation === "conflict") { statuses.conflict += 1; candidateStatus.push("conflict"); continue; }
    if (semanticMatch?.relation === "equal") {
      const merged = mergeRecords(semanticMatch.record, candidate);
      if (merged.conflicts.length) { statuses.conflict += 1; candidateStatus.push("conflict"); continue; }
      const index = allRecords.indexOf(semanticMatch.record);
      if (index >= 0) allRecords[index] = merged.merged;
      const bucket = semanticBucket(semanticMatch.record, timeZone);
      const bucketRows = semanticIndex.get(bucket) ?? [];
      const bucketIndex = bucketRows.indexOf(semanticMatch.record);
      if (bucketIndex >= 0) bucketRows[bucketIndex] = merged.merged;
      semanticIndex.set(bucket, bucketRows);
      statuses.duplicate += 1;
      candidateStatus.push("duplicate");
      continue;
    }
    acceptedCandidates.push(candidate);
    allRecords.push(candidate);
    const bucket = semanticBucket(candidate, timeZone);
    semanticIndex.set(bucket, [...(semanticIndex.get(bucket) ?? []), candidate]);
    candidateStatus.push("new");
  }

  const existingMetricByKey = new Map();
  const duplicateMetricKeys = new Set();
  for (const metric of existingMetrics) {
    const key = metricKey(metric, userId);
    if (!metric.metric_date) continue;
    if (existingMetricByKey.has(key)) duplicateMetricKeys.add(key);
    else existingMetricByKey.set(key, metric);
  }
  const dates = [...new Set(allRecords.map((record) => recordDate(record, timeZone)).filter(Boolean))].sort();
  const rows = [];
  const recordsByDate = new Map();
  for (const record of allRecords) {
    const date = recordDate(record, timeZone);
    if (!date) continue;
    recordsByDate.set(date, [...(recordsByDate.get(date) ?? []), record]);
  }
  for (const date of dates) {
    const derived = derivedForDate(recordsByDate.get(date) ?? []);
    const existing = existingMetricByKey.get(`${effectiveUserId}|${date}`) ?? existingMetricByKey.get(`|${date}`) ?? null;
    const writeValues = {};
    let hasCandidateValue = false;
    let hasConflict = false;
    let hasNew = false;
    for (const field of TARGET_FIELDS) {
      const candidateValue = derived[field];
      if (candidateValue === null) continue;
      hasCandidateValue = true;
      fieldCounts[field].candidateValues += 1;
      const existingValue = existing?.[field];
      if (existingValue === null || existingValue === undefined || existingValue === "") {
        fieldCounts[field].new += 1;
        writeValues[field] = candidateValue;
        hasNew = true;
      } else if (valueEqual(field, existingValue, candidateValue)) {
        fieldCounts[field].alreadyPresent += 1;
      } else {
        fieldCounts[field].conflict += 1;
        hasConflict = true;
      }
    }
    let status = "no_value";
    if (hasConflict) { status = "conflict"; deleteAll(writeValues); }
    else if (hasNew) status = "new";
    else if (hasCandidateValue) status = "already_present";
    statuses[status] += 1;
    rows.push({ metric_date: date, derived, existing, status, writeValues: status === "new" ? writeValues : {} });
  }

  const safeReport = {
    version: 1,
    dryRun: true,
    targetFields: TARGET_FIELDS,
    cutoffs: { whoopThrough, googleTakeoutFrom: googleFrom },
    sourceCounts: sourceCounts(normalizedCandidates),
    existingRecords: normalizedExisting.length,
    candidateRecords: normalizedCandidates.length,
    retainedCandidateRecords: acceptedCandidates.length,
    existingMetricRows: existingMetrics.length,
    duplicateMetricRows: duplicateMetricKeys.size,
    derivedDays: dates.length,
    statusCounts: statuses,
    fieldCounts,
    sqlGenerated: false,
    sqlRows: 0,
  };
  return { userId: effectiveUserId, rows, report: safeReport, records: allRecords, candidateStatus };
}

function deleteAll(object) {
  for (const key of Object.keys(object)) delete object[key];
}

function parseArgs(argv) {
  const options = { candidates: [], generateSql: false };
  const valueFlags = new Set(["candidate-records", "records", "existing-records", "existing-metrics", "report", "sql-output", "user-id", "time-zone", "whoop-through", "google-from", "now"]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--generate-sql") { options.generateSql = true; continue; }
    if (arg === "--help") return { help: true };
    if (!arg.startsWith("--") || !valueFlags.has(arg.slice(2))) throw new Error(`Unknown option: ${arg}`);
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}.`);
    if (key === "candidate-records" || key === "records") options.candidates.push(value);
    else options[key] = value;
    index += 1;
  }
  if (!options["existing-records"] || !options["existing-metrics"]) throw new Error("--existing-records and --existing-metrics are required.");
  if (!options.candidates.length) throw new Error("At least one --candidate-records file is required.");
  if (options.generateSql && !options["sql-output"]) throw new Error("--generate-sql requires --sql-output.");
  if (options["sql-output"] && !options.generateSql) throw new Error("--sql-output requires --generate-sql.");
  return options;
}

function helpText() {
  return [
    "Offline, dry-run-by-default backfill of new wearable daily metrics.",
    "Candidate files are normalized WHOOP/Google Takeout health_records JSON.",
    "",
    "Usage:",
    "  node scripts/backfill-derived-metrics.mjs --candidate-records records.json --existing-records d1-records.json --existing-metrics d1-metrics.json --report report.json",
    "",
    "Options:",
    "  --candidate-records PATH  Normalized records JSON; may be repeated (required)",
    "  --existing-records PATH   D1 health_records export (required)",
    "  --existing-metrics PATH   D1 daily_health_metrics export (required)",
    "  --user-id ID              Fill missing user_id values",
    "  --time-zone ZONE          Civil-date zone (default Europe/Paris)",
    `  --whoop-through DATE      Default ${DEFAULT_CUTOFFS.whoopThrough}`,
    `  --google-from DATE        Default ${DEFAULT_CUTOFFS.googleFrom}`,
    "  --report PATH             Write the aggregate, non-sensitive report",
    "  --generate-sql            Explicitly enable SQL generation",
    "  --sql-output PATH         Write idempotent D1 SQL (requires --generate-sql)",
  ].join("\n");
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) { console.log(helpText()); return null; }
  const [existingRecords, existingMetrics, ...candidateSets] = await Promise.all([
    readRows(options["existing-records"], "health_records"),
    readRows(options["existing-metrics"], "daily_health_metrics"),
    ...options.candidates.map((path) => readRows(path, "health_records")),
  ]);
  const candidates = candidateSets.flat();
  const plan = buildPlan({
    candidates,
    existingRecords,
    existingMetrics,
    userId: options["user-id"],
    timeZone: options["time-zone"] ?? "Europe/Paris",
    whoopThrough: options["whoop-through"] ?? DEFAULT_CUTOFFS.whoopThrough,
    googleFrom: options["google-from"] ?? DEFAULT_CUTOFFS.googleFrom,
  });
  let report = plan.report;
  if (options.generateSql) {
    const generated = buildSql(plan, { generateSql: true, now: options.now });
    await writeFile(resolve(options["sql-output"]), generated.sql, "utf8");
    report = { ...report, sqlGenerated: true, sqlRows: generated.sqlRows };
  }
  const rendered = `${JSON.stringify(report, null, 2)}\n`;
  if (options.report) await writeFile(resolve(options.report), rendered, "utf8");
  else process.stdout.write(rendered);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Derived metric backfill failed.");
    process.exitCode = 1;
  });
}
