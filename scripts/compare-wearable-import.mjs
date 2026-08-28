#!/usr/bin/env node

/**
 * Compare normalized wearable records with a local export of Cloudflare D1.
 *
 * This is deliberately an offline operation. It never connects to Cloudflare
 * and never writes a database. By default it prints only an aggregate report;
 * SQL is emitted only when --generate-sql and --sql-output are both supplied.
 */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const DEFAULT_CUTOFFS = Object.freeze({
  whoopThrough: "2026-05-28",
  googleFrom: "2026-05-29",
});

const VOLATILE_KEYS = new Set([
  "created_at",
  "updated_at",
  "ingested_at",
  "staged_at",
  "job_id",
  "reconciliation_token",
]);

const SOURCE_KEYS = new Set([
  "source",
  "dataSource",
  "data_source",
  "device",
  "recordingMethod",
  "recording_method",
  "name",
  "logId",
]);

const STATUS_NAMES = [
  "new",
  "enrichment",
  "already_present_exact",
  "duplicate_exact",
  "duplicate_semantic",
  "conflict",
  "outside_cutoff",
  "invalid",
];

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableValue(value, { stripSource = false } = {}) {
  if (Array.isArray(value)) return value.map((item) => stableValue(item, { stripSource }));
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !VOLATILE_KEYS.has(key) && (!stripSource || !SOURCE_KEYS.has(key)))
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, item]) => [key, stableValue(item, { stripSource })]));
}

function stableJson(value, options) {
  return JSON.stringify(stableValue(value, options));
}

function hash(value) {
  return createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex").slice(0, 16);
}

function dateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? value : null;
}

function dateFromTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
}

export function recordDate(record) {
  return dateOnly(record.civil_date)
    ?? dateFromTimestamp(record.end_time)
    ?? dateFromTimestamp(record.start_time)
    ?? dateFromTimestamp(record.measured_at);
}

function sourceKind(record) {
  if (record.provider === "whoop_export") return "whoop";
  if (record.provider !== "google_health") return "unknown";
  const sourceProvider = isObject(record.payload?.source) ? record.payload.source.provider : null;
  if (record.recording_method === "TAKEOUT_VERIFIED" || sourceProvider === "google_takeout") return "takeout";
  return "google_api";
}

function exactKey(record) {
  return JSON.stringify([
    record.user_id ?? null,
    record.provider ?? null,
    record.data_type ?? null,
    record.source_record_id ?? null,
  ]);
}

function comparableRecord(record) {
  return {
    provider: record.provider ?? null,
    data_type: record.data_type ?? null,
    civil_date: record.civil_date ?? null,
    start_time: record.start_time ?? null,
    end_time: record.end_time ?? null,
    measured_at: record.measured_at ?? null,
    payload: stableValue(record.payload ?? null, { stripSource: true }),
  };
}

function comparableEqual(first, second) {
  return stableJson(comparableRecord(first)) === stableJson(comparableRecord(second));
}

function flattenLeaves(value, prefix = "", output = new Map()) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenLeaves(item, `${prefix}[${index}]`, output));
    return output;
  }
  if (isObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      flattenLeaves(item, path, output);
    }
    return output;
  }
  output.set(prefix, value);
  return output;
}

function isPayloadEnrichment(existing, incoming) {
  const previousEnvelope = comparableRecord(existing);
  const nextEnvelope = comparableRecord(incoming);
  if (stableJson({ ...previousEnvelope, payload: undefined }) !== stableJson({ ...nextEnvelope, payload: undefined })) return false;
  const previous = flattenLeaves(stableValue(existing.payload ?? null, { stripSource: true }));
  const next = flattenLeaves(stableValue(incoming.payload ?? null, { stripSource: true }));
  let added = 0;
  for (const [path, value] of previous) {
    if (!next.has(path) || stableJson(next.get(path)) !== stableJson(value)) return false;
  }
  for (const path of next.keys()) if (!previous.has(path)) added += 1;
  return added > 0;
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
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === "string" && candidate.trim() && Number.isFinite(Number(candidate))) return Number(candidate);
  }
  for (const child of Object.values(value)) {
    const found = findNumber(child, keys);
    if (found !== null) return found;
  }
  return null;
}

function findDurationSeconds(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findDurationSeconds(item);
      if (found !== null) return found;
    }
    return null;
  }
  if (!isObject(value)) {
    if (typeof value !== "string") return null;
    const seconds = value.match(/^(-?\d+(?:\.\d+)?)s$/);
    if (seconds) return Number(seconds[1]);
    const milliseconds = value.match(/^(-?\d+(?:\.\d+)?)ms$/);
    return milliseconds ? Number(milliseconds[1]) / 1000 : null;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "durationSum" || key === "duration" || key === "activeDuration") {
      const found = findDurationSeconds(child);
      if (found !== null) return found;
    }
  }
  for (const child of Object.values(value)) {
    const found = findDurationSeconds(child);
    if (found !== null) return found;
  }
  return null;
}

function timeMs(value) {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timeDifference(first, second) {
  const left = timeMs(first);
  const right = timeMs(second);
  return left === null || right === null ? null : Math.abs(left - right);
}

function exerciseType(record) {
  const exercise = findObject(record.payload, "exercise");
  const value = exercise?.exerciseType ?? exercise?.displayName ?? exercise?.title;
  return typeof value === "string" ? value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_") : null;
}

function semanticFamily(record) {
  if (["run-vo2-max", "vo2-max"].includes(record.data_type)) return "vo2-event";
  return record.data_type ?? "unknown";
}

function numericMetric(record, metric) {
  if (metric === "distance") return findNumber(record.payload, ["distanceMillimeters", "millimeters", "millimetersSum"]);
  if (metric === "vo2") return findNumber(record.payload, ["vo2Max", "runVo2Max", "dailyVo2Max"]);
  if (metric === "duration") {
    const direct = findNumber(record.payload, ["durationSeconds"])
      ?? findDurationSeconds(record.payload)
      ?? findNumber(record.payload, ["durationSum"]);
    if (direct !== null) return direct > 10_000 ? direct / 1000 : direct;
    const start = timeMs(record.start_time);
    const end = timeMs(record.end_time);
    return start !== null && end !== null ? (end - start) / 1000 : null;
  }
  if (metric === "heartRate") return findNumber(record.payload, ["averageHeartRateBeatsPerMinute", "averageHeartRate"]);
  return null;
}

function numericClose(first, second, tolerance) {
  return first === null || second === null ? true : Math.abs(first - second) <= tolerance;
}

function eventTime(record) {
  return record.start_time ?? record.measured_at ?? record.end_time ?? null;
}

function sameDate(first, second) {
  const left = recordDate(first);
  const right = recordDate(second);
  return left !== null && left === right;
}

/**
 * Return whether two records occupy the same semantic slot and whether their
 * measured content is compatible. A null result means that they are separate
 * events. "conflict" deliberately remains distinct from a new record so a
 * changed source value cannot be silently added beside the old one.
 */
export function semanticRelation(first, second) {
  const family = semanticFamily(first);
  if (family !== semanticFamily(second) || !sameDate(first, second)) return null;

  if (family === "distance") {
    const left = numericMetric(first, "distance");
    const right = numericMetric(second, "distance");
    if (left === null || right === null) return comparableEqual(first, second) ? "equal" : "conflict";
    return Math.abs(left - right) <= 10_000 ? "equal" : "conflict";
  }

  if (family === "daily-vo2-max") {
    const left = numericMetric(first, "vo2");
    const right = numericMetric(second, "vo2");
    if (left === null || right === null) return comparableEqual(first, second) ? "equal" : "conflict";
    return Math.abs(left - right) <= 0.02 ? "equal" : "conflict";
  }

  if (family === "vo2-event") {
    const difference = timeDifference(eventTime(first), eventTime(second));
    if (difference === null || difference > 5 * 60_000) return null;
    const left = numericMetric(first, "vo2");
    const right = numericMetric(second, "vo2");
    return numericClose(left, right, 0.02) ? "equal" : "conflict";
  }

  if (family === "sedentary-period") {
    const startDifference = timeDifference(first.start_time, second.start_time);
    const endDifference = timeDifference(first.end_time, second.end_time);
    if (startDifference === null || endDifference === null || startDifference > 60_000 || endDifference > 60_000) return null;
    return numericClose(numericMetric(first, "duration"), numericMetric(second, "duration"), 60) ? "equal" : "conflict";
  }

  if (family === "exercise") {
    if (exerciseType(first) !== exerciseType(second)) return null;
    const startDifference = timeDifference(first.start_time, second.start_time);
    const endDifference = timeDifference(first.end_time, second.end_time);
    if (startDifference === null || endDifference === null || startDifference > 60_000 || endDifference > 60_000) return null;
    if (!numericClose(numericMetric(first, "duration"), numericMetric(second, "duration"), 60)) return "conflict";
    if (!numericClose(numericMetric(first, "distance"), numericMetric(second, "distance"), 10_000)) return "conflict";
    if (!numericClose(numericMetric(first, "heartRate"), numericMetric(second, "heartRate"), 2)) return "conflict";
    return "equal";
  }

  const startDifference = timeDifference(eventTime(first), eventTime(second));
  if (startDifference !== null && startDifference <= 60_000) return comparableEqual(first, second) ? "equal" : "conflict";
  return comparableEqual(first, second) ? "equal" : null;
}

function semanticBucket(record) {
  const family = semanticFamily(record);
  const date = recordDate(record) ?? "unknown-date";
  if (family === "exercise") return `${family}|${date}|${exerciseType(record) ?? "unknown-type"}`;
  if (family === "vo2-event") return `${family}|${date}`;
  return `${family}|${date}`;
}

function validationStatus(record, options) {
  if (!isObject(record)) return "invalid";
  if (typeof record.provider !== "string" || typeof record.data_type !== "string" || typeof record.source_record_id !== "string" || !record.source_record_id) return "invalid";
  if (typeof record.user_id !== "string" || !record.user_id) return "invalid";
  const date = recordDate(record);
  if (!date) return "invalid";
  const kind = sourceKind(record);
  if (kind === "unknown" || kind === "google_api") return "invalid";
  if (kind === "whoop" && date > options.whoopThrough) return "outside_cutoff";
  if (kind === "takeout" && date < options.googleFrom) return "outside_cutoff";
  return null;
}

function makeResult(record, status, reason, matched = null) {
  const safeRecord = isObject(record) ? record : {};
  return {
    record: safeRecord,
    status,
    reason,
    matched,
    exactHash: hash(exactKey(safeRecord)),
    semanticHash: hash(`${semanticBucket(safeRecord)}|${stableJson(safeRecord.payload, { stripSource: true })}`),
  };
}

function buildIndex(records, key) {
  const index = new Map();
  for (const record of records) {
    const value = key(record);
    const current = index.get(value) ?? [];
    current.push(record);
    index.set(value, current);
  }
  return index;
}

function normalizeRecord(input, userId) {
  const record = isObject(input) ? { ...input } : input;
  if (!isObject(record)) return record;
  return record.user_id || !userId ? record : { ...record, user_id: userId };
}

/**
 * Compare candidate records against existing health_records rows.
 *
 * Existing rows can be either normalized records or D1 `soma_rows` wrappers;
 * callers should use `readRows` for files, while tests can pass records here.
 */
export function compareRecords(input, options = {}) {
  const existingUserIds = new Set((input.existing ?? [])
    .map((record) => isObject(record) ? record.user_id : null)
    .filter((value) => typeof value === "string" && value));
  const inferredUserId = existingUserIds.size === 1 ? [...existingUserIds][0] : null;
  const configuration = {
    ...DEFAULT_CUTOFFS,
    ...options,
    userId: options.userId ?? inferredUserId,
  };
  const candidates = (input.candidates ?? []).map((record) => normalizeRecord(record, configuration.userId));
  const existing = (input.existing ?? []).map((record) => normalizeRecord(record, configuration.userId));
  const existingByExact = buildIndex(existing, exactKey);
  const existingBySemantic = buildIndex(existing, semanticBucket);
  const seenCandidates = new Map();
  const acceptedCandidates = [];
  const results = [];

  for (const candidate of candidates) {
    const invalid = validationStatus(candidate, configuration);
    if (invalid) {
      results.push(makeResult(candidate, invalid, invalid));
      continue;
    }

    const candidateExact = exactKey(candidate);
    const previousCandidate = seenCandidates.get(candidateExact);
    if (previousCandidate) {
      results.push(makeResult(candidate, comparableEqual(previousCandidate, candidate) ? "duplicate_exact" : "conflict", comparableEqual(previousCandidate, candidate) ? "candidate_exact_duplicate" : "candidate_exact_conflict", previousCandidate));
      continue;
    }
    seenCandidates.set(candidateExact, candidate);

    const exactMatches = existingByExact.get(candidateExact) ?? [];
    if (exactMatches.length) {
      const exact = exactMatches[0];
      if (comparableEqual(exact, candidate)) {
        results.push(makeResult(candidate, "already_present_exact", "existing_exact_match", exact));
        continue;
      }
      if (isPayloadEnrichment(exact, candidate)) {
        results.push(makeResult(candidate, "enrichment", "existing_exact_payload_enrichment", exact));
        acceptedCandidates.push(candidate);
        continue;
      }
      results.push(makeResult(candidate, "conflict", "existing_exact_payload_conflict", exact));
      continue;
    }

    const possibleMatches = [
      ...(existingBySemantic.get(semanticBucket(candidate)) ?? []),
      ...acceptedCandidates.filter((record) => semanticBucket(record) === semanticBucket(candidate)),
    ];
    const relation = possibleMatches.map((record) => ({ record, relation: semanticRelation(candidate, record) })).find((item) => item.relation);
    if (relation?.relation === "equal") {
      results.push(makeResult(candidate, "duplicate_semantic", "existing_semantic_match", relation.record));
      continue;
    }
    if (relation?.relation === "conflict") {
      results.push(makeResult(candidate, "conflict", "existing_semantic_payload_conflict", relation.record));
      continue;
    }

    results.push(makeResult(candidate, "new", "no_existing_match"));
    acceptedCandidates.push(candidate);
  }

  return {
    results,
    report: buildSafeReport({ results, candidates, existing, configuration }),
  };
}

function emptyStatusCounts() {
  return Object.fromEntries(STATUS_NAMES.map((status) => [status, 0]));
}

function buildSafeReport({ results, candidates, existing, configuration }) {
  const counts = emptyStatusCounts();
  const sourceCounts = { whoop: 0, takeout: 0, unknown: 0 };
  const byType = {};
  for (const result of results) {
    counts[result.status] = (counts[result.status] ?? 0) + 1;
    const type = typeof result.record?.data_type === "string" ? result.record.data_type : "invalid";
    byType[type] ??= emptyStatusCounts();
    byType[type][result.status] = (byType[type][result.status] ?? 0) + 1;
    const kind = sourceKind(result.record);
    if (kind in sourceCounts) sourceCounts[kind] += 1;
  }
  return {
    version: 1,
    dryRun: true,
    candidateRecords: candidates.length,
    existingRecords: existing.length,
    cutoffs: {
      whoopThrough: configuration.whoopThrough,
      googleTakeoutFrom: configuration.googleFrom,
    },
    counts,
    sourceCounts,
    byType: Object.fromEntries(Object.entries(byType).sort(([first], [second]) => first.localeCompare(second))),
    sqlGenerated: false,
    sqlRecords: 0,
    // Deliberately no dates, values, payloads, email addresses, or source IDs.
  };
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function rowWithDefaults(record, now) {
  return {
    ...record,
    id: record.id ?? crypto.randomUUID(),
    created_at: record.created_at ?? now,
    updated_at: now,
  };
}

function rowKey(record) {
  return encodeURIComponent(JSON.stringify([
    ["user_id", record.user_id],
    ["provider", record.provider],
    ["data_type", record.data_type],
    ["source_record_id", record.source_record_id],
  ]));
}

function insertStatement(record, mode) {
  const table = sqlLiteral("health_records");
  const key = sqlLiteral(rowKey(record));
  const userId = sqlLiteral(record.user_id);
  const jsonData = sqlLiteral(JSON.stringify(record));
  const createdAt = sqlLiteral(record.created_at);
  const updatedAt = sqlLiteral(record.updated_at);
  const conflict = "(table_name, row_key)";
  if (mode === "enrichment") {
    return `INSERT INTO soma_rows (table_name,row_key,user_id,json_data,created_at,updated_at) VALUES (${table},${key},${userId},${jsonData},${createdAt},${updatedAt}) ON CONFLICT${conflict} DO UPDATE SET user_id=excluded.user_id,json_data=excluded.json_data,updated_at=excluded.updated_at;`;
  }
  return `INSERT INTO soma_rows (table_name,row_key,user_id,json_data,created_at,updated_at) VALUES (${table},${key},${userId},${jsonData},${createdAt},${updatedAt}) ON CONFLICT${conflict} DO NOTHING;`;
}

/** Generate idempotent D1 SQL. Callers must explicitly opt into this action. */
export function buildSql(comparison, options = {}) {
  if (!options.generateSql) throw new Error("SQL generation requires generateSql: true.");
  const now = options.now ?? new Date().toISOString();
  const statements = [];
  let sqlRecords = 0;
  for (const result of comparison.results) {
    if (!["new", "enrichment"].includes(result.status)) continue;
    statements.push(insertStatement(rowWithDefaults(result.record, now), result.status));
    sqlRecords += 1;
  }
  return { sql: `${statements.join("\n")}\n`, sqlRecords };
}

function unwrapRows(value) {
  if (Array.isArray(value)) return value.flatMap(unwrapRows);
  if (!isObject(value)) return [];
  if (typeof value.json_data === "string") {
    try {
      const parsed = JSON.parse(value.json_data);
      return isObject(parsed) ? [parsed] : [];
    } catch {
      return [];
    }
  }
  if (value.table_name && value.table_name !== "health_records") return [];
  if (typeof value.data_type === "string") return [value];
  if (Array.isArray(value.results)) return value.results.flatMap(unwrapRows);
  if (Array.isArray(value.rows)) return value.rows.flatMap(unwrapRows);
  return [];
}

export function parseRowsText(source) {
  const trimmed = source.trim();
  if (!trimmed) return [];
  try {
    return unwrapRows(JSON.parse(trimmed));
  } catch {
    return trimmed.split(/\r?\n/).flatMap((line) => {
      try { return unwrapRows(JSON.parse(line)); } catch { return []; }
    });
  }
}

export async function readRows(path, userId) {
  const source = path === "-" ? await new Promise((resolveInput, reject) => {
    let value = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { value += chunk; });
    process.stdin.on("end", () => resolveInput(value));
    process.stdin.on("error", reject);
  }) : await readFile(resolve(path), "utf8");
  return parseRowsText(source).map((record) => normalizeRecord(record, userId));
}

function parseArgs(argv) {
  const options = { generateSql: false };
  const valueFlags = new Set(["candidates", "existing", "report", "sql-output", "user-id", "whoop-through", "google-from"]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--generate-sql") {
      options.generateSql = true;
      continue;
    }
    if (arg === "--help") return { help: true };
    if (!arg.startsWith("--") || !valueFlags.has(arg.slice(2))) throw new Error(`Unknown option: ${arg}`);
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}.`);
    options[key] = value;
    index += 1;
  }
  if (!options.candidates) throw new Error("--candidates is required.");
  if (options["sql-output"] && !options.generateSql) throw new Error("--sql-output requires --generate-sql.");
  if (options.generateSql && !options["sql-output"]) throw new Error("--generate-sql requires --sql-output.");
  return options;
}

function helpText() {
  return [
    "Compare normalized health records with a local D1 export (offline, dry-run by default).",
    "",
    "Usage:",
    "  node scripts/compare-wearable-import.mjs --candidates candidates.json --existing d1-health-records.json",
    "",
    "Options:",
    "  --candidates PATH       JSON array, JSONL, or Wrangler D1 JSON output (required)",
    "  --existing PATH         Existing health_records export; defaults to empty",
    "  --user-id ID            Fill missing user_id values in candidates",
    "  --report PATH           Write the safe aggregate report to PATH",
    "  --generate-sql          Explicitly enable SQL generation",
    "  --sql-output PATH       Write SQL for only new/enrichment records",
    `  --whoop-through DATE    Default ${DEFAULT_CUTOFFS.whoopThrough}`,
    `  --google-from DATE      Default ${DEFAULT_CUTOFFS.googleFrom}`,
  ].join("\n");
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(helpText());
    return;
  }
  const candidates = await readRows(options.candidates, options["user-id"]);
  const existing = options.existing ? await readRows(options.existing, options["user-id"]) : [];
  const comparison = compareRecords({ candidates, existing }, {
    userId: options["user-id"],
    whoopThrough: options["whoop-through"] ?? DEFAULT_CUTOFFS.whoopThrough,
    googleFrom: options["google-from"] ?? DEFAULT_CUTOFFS.googleFrom,
  });
  let report = comparison.report;
  if (options.generateSql) {
    const generated = buildSql(comparison, { generateSql: true });
    await writeFile(resolve(options["sql-output"]), generated.sql, "utf8");
    report = { ...report, sqlGenerated: true, sqlRecords: generated.sqlRecords };
  }
  const rendered = `${JSON.stringify(report, null, 2)}\n`;
  if (options.report) await writeFile(resolve(options.report), rendered, "utf8");
  else process.stdout.write(rendered);
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Wearable comparison failed.");
    process.exitCode = 1;
  });
}
