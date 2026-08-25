import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const options = Object.fromEntries(process.argv.slice(2).map((argument, index, all) => argument.startsWith("--") ? [argument.slice(2), all[index + 1]] : null).filter(Boolean));
const userId = options["user-id"];
if (!userId) throw new Error("Usage: node scripts/build-cloudflare-import.mjs --user-id <id> [--data-dir <path>] [--output <path>] [--archive-object-path <R2 key> --archive-sha256 <hash> --archive-bytes <bytes>]");
const dataDir = resolve(options["data-dir"] ?? "/Users/jeremydelloume/Downloads/Soma-wearable-data-2026-08-24");
const output = resolve(options.output ?? "/tmp/soma-cloudflare-import.sql");
const whoop = JSON.parse(await readFile(resolve(dataDir, "normalized/whoop_health_records.json"), "utf8"));
const fitbit = parseCsv(await readFile(resolve(dataDir, "normalized/google-health-analysis/daily_merged.csv"), "utf8"));
const now = new Date().toISOString();

function parseCsv(source) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [headers, ...values] = rows.filter((item) => item.some(Boolean));
  return values.map((items) => Object.fromEntries(headers.map((header, index) => [header, items[index] ?? ""])));
}

function number(value) {
  return value === "" || value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);
}

function sumOrNull(values) {
  const available = values.filter((value) => value !== null);
  return available.length ? available.reduce((sum, value) => sum + value, 0) : null;
}

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function identity(row, keys) {
  return encodeURIComponent(JSON.stringify(keys.map((key) => [key, row[key]])));
}

function statement(table, row, keys) {
  const complete = { id: row.id ?? crypto.randomUUID(), created_at: row.created_at ?? now, updated_at: row.updated_at ?? now, ...row };
  return `INSERT INTO soma_rows (table_name,row_key,user_id,json_data,created_at,updated_at) VALUES (${sql(table)},${sql(identity(complete, keys))},${complete.user_id ? sql(complete.user_id) : "NULL"},${sql(JSON.stringify(complete))},${sql(complete.created_at)},${sql(complete.updated_at)}) ON CONFLICT(table_name,row_key) DO UPDATE SET user_id=excluded.user_id,json_data=excluded.json_data,updated_at=excluded.updated_at;`;
}

function nested(payload, ...path) {
  return path.reduce((value, key) => value?.[key], payload);
}

const byDate = new Map();
for (const record of whoop) {
  if (!record.civil_date || record.civil_date > "2026-05-28") continue;
  const day = byDate.get(record.civil_date) ?? [];
  day.push(record);
  byDate.set(record.civil_date, day);
}

function whoopMetric(date, records) {
  const record = (type) => records.find((item) => item.data_type === type);
  const sleep = record("sleep");
  const summary = nested(sleep?.payload, "sleep", "summary") ?? {};
  const stages = Array.isArray(summary.stagesSummary) ? summary.stagesSummary : [];
  const stage = (type) => number(stages.find((item) => item.type === type)?.minutes);
  const zones = nested(record("time-in-heart-rate-zone")?.payload, "timeInHeartRateZone", "timeInHeartRateZones") ?? [];
  const zone = (type) => number(zones.find((item) => item.heartRateZone === type)?.durationMinutes);
  const measured = records.map((item) => item.measured_at).filter(Boolean).sort().at(-1) ?? null;
  const asleep = number(summary.minutesAsleep);
  const period = number(summary.minutesInSleepPeriod);
  const light = stage("LIGHT"), moderate = zone("MODERATE"), vigorous = zone("VIGOROUS"), peak = zone("PEAK");
  return {
    user_id: userId,
    metric_date: date,
    sleep_minutes: asleep,
    sleep_efficiency: asleep !== null && period ? Math.round(asleep / period * 10000) / 100 : null,
    sleep_awake_minutes: number(summary.minutesAwake),
    sleep_deep_minutes: stage("DEEP"),
    sleep_rem_minutes: stage("REM"),
    sleep_light_minutes: stage("LIGHT"),
    bedtime: sleep?.start_time ?? null,
    wake_time: sleep?.end_time ?? null,
    hrv_ms: number(nested(record("daily-heart-rate-variability")?.payload, "dailyHeartRateVariability", "averageHeartRateVariabilityMilliseconds")),
    resting_heart_rate: number(nested(record("daily-resting-heart-rate")?.payload, "dailyRestingHeartRate", "beatsPerMinute")),
    respiratory_rate: number(nested(record("daily-respiratory-rate")?.payload, "dailyRespiratoryRate", "averageBreathsPerMinute")),
    oxygen_saturation: number(nested(record("daily-oxygen-saturation")?.payload, "dailyOxygenSaturation", "averagePercentage")),
    nightly_temperature_celsius: number(nested(record("daily-sleep-temperature-derivations")?.payload, "dailySleepTemperatureDerivations", "nightlyTemperatureCelsius")),
    exercise_minutes: number(nested(record("daily-exercise-summary")?.payload, "dailyExerciseSummary", "minutes")),
    light_zone_minutes: light,
    moderate_zone_minutes: moderate,
    vigorous_zone_minutes: vigorous,
    peak_zone_minutes: peak,
    zone_minutes: sumOrNull([moderate, vigorous, peak]),
    data_quality: { presentTypes: [...new Set(records.map((item) => item.data_type))], recordCount: records.length, sourceDevices: ["WHOOP"], providers: ["whoop_export"], primaryWearable: "WHOOP" },
    source_freshness: { latestMeasuredAt: measured, byType: Object.fromEntries(records.map((item) => [item.data_type, item.measured_at])) },
    algorithm_input_version: "cloudflare-import-v1",
  };
}

function fitbitBedtime(date, hour) {
  if (hour === null) return null;
  const roundedMinutes = Math.round(hour * 60);
  const bedtimeDate = new Date(`${date}T12:00:00Z`);
  if (hour >= 12) bedtimeDate.setUTCDate(bedtimeDate.getUTCDate() - 1);
  const civil = bedtimeDate.toISOString().slice(0, 10);
  const hh = Math.floor(roundedMinutes / 60) % 24;
  const mm = roundedMinutes % 60;
  return `${civil}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+02:00`;
}

function fitbitMetric(row) {
  const bedtime = fitbitBedtime(row.date, number(row.bedtime_hour));
  const sleepMinutes = number(row.sleep_minutes);
  const wakeMinutes = number(row.wake_minutes);
  const wakeTime = bedtime && sleepMinutes !== null ? new Date(Date.parse(bedtime) + (sleepMinutes + (wakeMinutes ?? 0)) * 60_000).toISOString() : null;
  const moderate = number(row.moderate_minutes), vigorous = number(row.vigorous_minutes);
  const present = Object.entries(row).filter(([, value]) => value !== "").map(([key]) => key);
  return {
    user_id: userId,
    metric_date: row.date,
    sleep_minutes: sleepMinutes,
    sleep_efficiency: number(row.sleep_efficiency),
    sleep_awake_minutes: wakeMinutes,
    sleep_deep_minutes: number(row.deep_sleep_minutes),
    sleep_rem_minutes: number(row.rem_sleep_minutes),
    bedtime,
    wake_time: wakeTime,
    hrv_ms: number(row.hrv_ms),
    resting_heart_rate: number(row.rhr_bpm),
    respiratory_rate: number(row.respiratory_rate),
    oxygen_saturation: number(row.spo2_pct),
    nightly_temperature_celsius: number(row.nightly_temperature_c),
    baseline_temperature_celsius: number(row.baseline_temperature_c),
    skin_temperature_delta: number(row.temperature_delta_c),
    steps: number(row.steps),
    moderate_zone_minutes: moderate,
    vigorous_zone_minutes: vigorous,
    zone_minutes: number(row.active_zone_minutes) ?? sumOrNull([moderate, vigorous]),
    exercise_minutes: number(row.exercise_minutes),
    data_quality: { presentTypes: present, recordCount: present.length, sourceDevices: ["Fitbit"], providers: ["google_takeout"], primaryWearable: "Fitbit" },
    source_freshness: { latestMeasuredAt: `${row.date}T23:59:59+02:00`, byType: {} },
    algorithm_input_version: "cloudflare-import-v1",
  };
}

function clampScore(value) {
  return Math.round(Math.min(Math.max(value, 0), 100));
}

function scoreStatus(score) {
  if (score === null) return "limited";
  if (score >= 80) return "restorative";
  if (score >= 60) return "steady";
  return "building";
}

function minutesInParis(value) {
  if (!value) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  return Number(parts.find((part) => part.type === "hour")?.value ?? 0) * 60 + Number(parts.find((part) => part.type === "minute")?.value ?? 0);
}

function circularMean(values) {
  const radians = values.map((value) => value / 1440 * 2 * Math.PI);
  const sine = radians.reduce((sum, value) => sum + Math.sin(value), 0) / values.length;
  const cosine = radians.reduce((sum, value) => sum + Math.cos(value), 0) / values.length;
  const angle = Math.atan2(sine, cosine);
  return Math.round((((angle < 0 ? angle + 2 * Math.PI : angle) / (2 * Math.PI)) * 1440) % 1440);
}

function circularDifference(first, second) {
  return Math.abs(((first - second + 720) % 1440) - 720);
}

function regularityFor(nights) {
  if (nights.length < 3) return null;
  const current = nights.at(-1), reference = nights.slice(0, -1);
  const difference = (circularDifference(current.bedtimeMinutes, circularMean(reference.map((item) => item.bedtimeMinutes))) + circularDifference(current.wakeMinutes, circularMean(reference.map((item) => item.wakeMinutes)))) / 2;
  return Math.round(Math.max(0, 100 - difference / 120 * 100));
}

function zScore(value, baseline) {
  const mean = baseline.reduce((sum, item) => sum + item, 0) / baseline.length;
  const deviation = baseline.length < 2 ? 0 : Math.sqrt(baseline.reduce((sum, item) => sum + (item - mean) ** 2, 0) / (baseline.length - 1));
  return deviation ? (value - mean) / deviation : 0;
}

function enrichMetricsAndScores(metrics) {
  const scores = [];
  const priorEffort = [];
  const sleepDebt = [];
  for (const [index, metric] of metrics.entries()) {
    const history = metrics.slice(Math.max(0, index - 30), index);
    const nights = [...history, metric].filter((item) => item.bedtime && item.wake_time).slice(-14).map((item) => ({ bedtimeMinutes: minutesInParis(item.bedtime), wakeMinutes: minutesInParis(item.wake_time) }));
    metric.sleep_need_minutes = 510;
    metric.sleep_regularity = regularityFor(nights);
    const duration = metric.sleep_minutes === null ? null : Math.min(Math.max(metric.sleep_minutes / 510, 0), 1);
    const efficiency = metric.sleep_efficiency === null ? null : Math.min(Math.max(metric.sleep_efficiency / 100, 0), 1);
    const sleepScore = duration !== null && efficiency !== null && metric.sleep_regularity !== null
      ? Math.round(100 * (0.7 * duration + 0.15 * efficiency + 0.15 * metric.sleep_regularity / 100))
      : null;
    const hrvBaseline = history.map((item) => item.hrv_ms).filter((value) => value !== null);
    const rhrBaseline = history.map((item) => item.resting_heart_rate).filter((value) => value !== null);
    const recoveryReady = metric.hrv_ms !== null && hrvBaseline.length >= 7 && metric.resting_heart_rate !== null && rhrBaseline.length >= 7 && sleepScore !== null;
    const recoveryScore = recoveryReady ? clampScore(
      clampScore(50 + zScore(metric.hrv_ms, hrvBaseline) * 15) * 0.4 +
      clampScore(50 - zScore(metric.resting_heart_rate, rhrBaseline) * 15) * 0.3 + sleepScore * 0.3,
    ) : null;
    const effortComponents = [
      { value: metric.zone_minutes, target: 75, weight: 50 },
      { value: metric.exercise_minutes, target: 60, weight: 25 },
      { value: metric.active_energy_kcal ?? null, target: 700, weight: 15 },
      { value: metric.steps, target: 12_000, weight: 10 },
    ];
    const available = effortComponents.filter((component) => component.value != null);
    const effortScore = available.length < 2 ? null : clampScore(available.reduce((sum, component) => sum + Math.min(Math.max(component.value, 0) / component.target, 1) * component.weight, 0) / available.reduce((sum, component) => sum + component.weight, 0) * 100);
    priorEffort.push(effortScore);
    const dailyDebt = metric.sleep_minutes === null ? null : 510 - metric.sleep_minutes;
    sleepDebt.push(dailyDebt);
    metric.daily_sleep_debt_minutes = dailyDebt;
    metric.cumulative_sleep_debt_minutes = Math.max(0, Math.round(sleepDebt.slice(-14).reduce((sum, value) => sum + (value ?? 0), 0)));
    metric.active_day = metric.steps != null ? metric.steps >= 7_500 : metric.zone_minutes != null ? metric.zone_minutes >= 20 : null;
    if (sleepScore !== null) scores.push({ user_id: userId, score_date: metric.metric_date, kind: "sleep", score: sleepScore, status: scoreStatus(sleepScore), drivers: { duration, efficiency, regularity: metric.sleep_regularity / 100 }, algorithm_version: "sleep-v0.1" });
    if (recoveryScore !== null) scores.push({ user_id: userId, score_date: metric.metric_date, kind: "recovery", score: recoveryScore, status: scoreStatus(recoveryScore), drivers: { coverage: 1 }, algorithm_version: "recovery-v1" });
    if (effortScore !== null) scores.push({ user_id: userId, score_date: metric.metric_date, kind: "effort", score: effortScore, status: scoreStatus(effortScore), drivers: { coverage: available.length / 4 }, algorithm_version: "effort-v2" });
  }
  return scores;
}

const rows = [];
rows.push(statement("profiles", { user_id: userId, display_name: "Jeremy", timezone: "Europe/Paris", import_range: "all_history", onboarding_completed_at: now }, ["user_id"]));
rows.push(statement("sleep_preferences", { user_id: userId, base_target_minutes: 510, usual_wake_time: "07:00", wind_down_minutes: 30 }, ["user_id"]));
if (options["archive-object-path"]) {
  if (!options["archive-sha256"] || !options["archive-bytes"]) throw new Error("Archive SHA-256 and byte size are required with --archive-object-path.");
  rows.push(statement("health_record_archives", {
    user_id: userId,
    provider: "wearable_export",
    data_type: "raw-source-export",
    range_start: "2025-05-12T00:00:00.000Z",
    range_end: "2026-08-23T00:00:00.000Z",
    object_path: options["archive-object-path"],
    storage_backend: "r2",
    storage_bucket: "soma-health-record-archives",
    row_count: 1930,
    compressed_bytes: Number(options["archive-bytes"]),
    object_sha256: options["archive-sha256"],
    verified_at: now,
    archive_format: "tar.zst",
  }, ["user_id", "provider", "data_type", "range_start", "range_end"]));
}
for (const record of whoop) {
  if (!record.civil_date || record.civil_date > "2026-05-28") continue;
  rows.push(statement("health_records", { ...record, user_id: userId }, ["user_id", "provider", "data_type", "source_record_id"]));
}
const metrics = [...byDate].map(([date, records]) => whoopMetric(date, records));
for (const row of fitbit) if (row.date >= "2026-05-29") metrics.push(fitbitMetric(row));
metrics.sort((left, right) => left.metric_date.localeCompare(right.metric_date));
const scores = enrichMetricsAndScores(metrics);
for (const metric of metrics) rows.push(statement("daily_health_metrics", metric, ["user_id", "metric_date"]));
for (const score of scores) rows.push(statement("daily_scores", score, ["user_id", "score_date", "kind"]));
await writeFile(output, `${rows.join("\n")}\n`);
console.log(JSON.stringify({ output, healthRecords: whoop.filter((row) => row.civil_date && row.civil_date <= "2026-05-28").length, whoopDays: byDate.size, fitbitDays: fitbit.filter((row) => row.date >= "2026-05-29").length, scores: scores.length, statements: rows.length }, null, 2));
