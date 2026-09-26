import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { previewScoreHistory } from "@/lib/local-preview";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { createCloudflareServerClient } from "@/lib/cloudflare/server";
import { calculateEffortScoreFromAvailable, effortScoreTargets, type EffortScoreTargets } from "@/domain/scores/effort";
import { calculateSleepScore } from "@/domain/scores/sleep";
import { recommendBedtimeFromHistory, type BedtimeRecommendation } from "@/domain/scores/sleep-need";
import { summarizePersonalLabActivities, type PersonalLabActivitySummary } from "@/domain/lab/activity-summary";
import { loadNutritionTargetsStateForUser } from "./nutrition-targets";

export type HealthMetricDay = {
  metric_date: string;
  sleep_minutes: number | null;
  sleep_need_minutes: number | null;
  sleep_efficiency: number | null;
  sleep_regularity: number | null;
  sleep_latency_minutes: number | null;
  sleep_awake_minutes: number | null;
  sleep_awake_percent: number | null;
  sleep_awakenings: number | null;
  sleep_fragmentation: number | null;
  sleep_deep_minutes: number | null;
  sleep_deep_percent: number | null;
  sleep_rem_minutes: number | null;
  sleep_rem_percent: number | null;
  sleep_light_minutes: number | null;
  sleep_light_percent: number | null;
  daily_sleep_debt_minutes: number | null;
  cumulative_sleep_debt_minutes: number | null;
  bedtime: string | null;
  wake_time: string | null;
  hrv_ms: number | null;
  resting_heart_rate: number | null;
  respiratory_rate: number | null;
  oxygen_saturation: number | null;
  oxygen_saturation_lower: number | null;
  oxygen_saturation_upper: number | null;
  skin_temperature_delta: number | null;
  nightly_temperature_celsius: number | null;
  baseline_temperature_celsius: number | null;
  steps: number | null;
  active_energy_kcal: number | null;
  total_energy_kcal: number | null;
  zone_minutes: number | null;
  light_zone_minutes: number | null;
  moderate_zone_minutes: number | null;
  vigorous_zone_minutes: number | null;
  peak_zone_minutes: number | null;
  active_minutes: number | null;
  sedentary_minutes: number | null;
  exercise_minutes: number | null;
  distance_km: number | null;
  running_distance_km: number | null;
  running_duration_minutes: number | null;
  running_pace_seconds_per_km: number | null;
  running_average_heart_rate: number | null;
  floors: number | null;
  weight_kg: number | null;
  body_fat_percent: number | null;
  vo2_max: number | null;
  altitude_gain_m: number | null;
  height_cm: number | null;
  core_body_temperature_celsius: number | null;
  blood_glucose_mg_dl: number | null;
  active_day: boolean | null;
  active_day_rate_28d: number | null;
  activity_consistency_28d: number | null;
  weekly_load: number | null;
  acute_chronic_load_ratio: number | null;
  data_quality?: {
    source?: string | null;
    providers?: string[];
    primaryWearable?: string | null;
    sourceDevices?: string[];
    importedAt?: string | null;
  };
  source_freshness: { latestMeasuredAt?: string | null; byType?: Record<string, string | null> };
};

export type ScoreDay = { score_date: string; kind: "sleep" | "recovery" | "effort"; score: number | null; drivers: Record<string, unknown>; algorithm_version?: string | null };
export type SleepStageSegment = { type: "AWAKE" | "LIGHT" | "DEEP" | "REM" | "ASLEEP" | "RESTLESS"; startTime: string; endTime: string };
export type HeartRateSample = { measuredAt: string; bpm: number };
export type ExerciseSplitSummary = {
  startTime: string | null;
  endTime: string | null;
  activeMinutes: number | null;
  distanceKm: number | null;
  averagePaceSecondsPerKm: number | null;
};
export type ExerciseHeartRateZones = {
  lightMinutes: number | null;
  moderateMinutes: number | null;
  vigorousMinutes: number | null;
  peakMinutes: number | null;
};
export type ExerciseSummary = { id: string; date: string; name: string; type: string; durationMinutes: number | null; activeMinutes: number | null; calories: number | null; distanceKm: number | null; averageHeartRate: number | null; maximumHeartRate?: number | null; zoneMinutes: number | null; averageSpeedKph: number | null; averagePaceSecondsPerKm: number | null; elevationGainMeters: number | null; steps: number | null; runVo2Max: number | null; swimLengths: number | null; cadence: number | null; strideLengthMeters: number | null; groundContactMilliseconds: number | null; verticalOscillationMillimeters: number | null; verticalRatio: number | null; startTime?: string | null; endTime?: string | null; splits?: ExerciseSplitSummary[]; heartRateZones?: ExerciseHeartRateZones | null };

export type HealthAnalytics = {
  timezone: string;
  importedAt: string | null;
  days: HealthMetricDay[];
  scores: ScoreDay[];
  sleepRecommendation: BedtimeRecommendation | null;
  latestSleepStages: SleepStageSegment[];
  heartRateSamples: HeartRateSample[];
  exercises: ExerciseSummary[];
  /** Shared score references; active energy follows the configured calorie target when available. */
  effortTargets: EffortScoreTargets;
  effortTargetSource: "nutrition_targets" | "fallback";
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findObject(value: unknown, key: string): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) { const found = findObject(item, key); if (found) return found; }
    return null;
  }
  if (!isObject(value)) return null;
  if (isObject(value[key])) return value[key] as Record<string, unknown>;
  for (const child of Object.values(value)) { const found = findObject(child, key); if (found) return found; }
  return null;
}

function findNumber(value: unknown, keys: string[]): number | null {
  if (Array.isArray(value)) {
    for (const item of value) { const found = findNumber(item, keys); if (found !== null) return found; }
    return null;
  }
  if (!isObject(value)) return null;
  for (const key of keys) {
    const number = Number(value[key]);
    if (value[key] !== null && value[key] !== undefined && Number.isFinite(number)) return number;
  }
  for (const child of Object.values(value)) { const found = findNumber(child, keys); if (found !== null) return found; }
  return null;
}

function durationMinutes(value: unknown) {
  if (typeof value !== "string") return null;
  const seconds = Number(value.replace(/s$/, ""));
  return Number.isFinite(seconds) ? seconds / 60 : null;
}

function durationMinutesOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const seconds = Number(value.endsWith("s") ? value.slice(0, -1) : value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds / 60 : null;
}

function minutesSinceMidnightIn(value: string, timeZone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const result = Number(parts.find((part) => part.type === "hour")?.value ?? 0) * 60 + Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return Number.isFinite(result) ? result : null;
}

function sleepRecommendationFor(input: {
  days: HealthMetricDay[];
  timezone: string;
  targetMinutes: number;
  wakeTime: string;
  windDownMinutes: number;
}) {
  const latestIndex = input.days.findLastIndex((day) => day.sleep_minutes !== null && day.sleep_minutes > 0);
  if (latestIndex < 0) return null;
  const recentDays = input.days.slice(Math.max(0, latestIndex - 29), latestIndex + 1);
  return recommendBedtimeFromHistory({
    wakeTime: input.wakeTime,
    sleepNeedMinutes: input.targetMinutes,
    recentNights: recentDays.map((day) => ({
      bedtimeMinutes: day.bedtime ? minutesSinceMidnightIn(day.bedtime, input.timezone) : null,
      efficiencyPercent: day.sleep_efficiency,
    })),
    windDownMinutes: input.windDownMinutes,
  });
}

export function buildPreviewAnalytics(): HealthAnalytics {
  const now = new Date();
  const days = Array.from({ length: 91 }, (_, index): HealthMetricDay => {
    const date = new Date(now);
    date.setDate(date.getDate() - (90 - index));
    const wave = Math.sin(index / 5);
    const sleep = Math.round(445 + wave * 24 + index * 0.18);
    const target = 480 + Math.round(Math.max(0, 12 - wave * 8));
    const deep = Math.round(sleep * (0.19 + wave * 0.01));
    const rem = Math.round(sleep * (0.23 - wave * 0.008));
    const light = sleep - deep - rem;
    const steps = Math.round(7_600 + wave * 1_900 + index * 14);
    const metricDate = date.toISOString().slice(0, 10);
    const previousDate = new Date(date);
    previousDate.setDate(previousDate.getDate() - 1);
    const bedtimeDate = previousDate.toISOString().slice(0, 10);
    return {
      metric_date: metricDate, sleep_minutes: sleep, sleep_need_minutes: target, sleep_efficiency: 91 + wave * 2, sleep_regularity: 79 + wave * 6,
      sleep_latency_minutes: 14 - wave * 3, sleep_awake_minutes: 36 - wave * 5, sleep_awake_percent: 7.2 - wave, sleep_awakenings: 8 - wave * 2, sleep_fragmentation: 1.1 - wave * 0.2,
      sleep_deep_minutes: deep, sleep_deep_percent: (deep / (sleep + 36)) * 100, sleep_rem_minutes: rem, sleep_rem_percent: (rem / (sleep + 36)) * 100, sleep_light_minutes: light, sleep_light_percent: (light / (sleep + 36)) * 100,
      daily_sleep_debt_minutes: target - sleep, cumulative_sleep_debt_minutes: Math.max(0, 170 - index * 1.1), bedtime: `${bedtimeDate}T22:48:00Z`, wake_time: `${metricDate}T06:58:00Z`,
      hrv_ms: 49 + wave * 5 + index * 0.06, resting_heart_rate: 61 - wave * 2 - index * 0.025, respiratory_rate: 14.4 + wave * 0.35, oxygen_saturation: 96.1 + wave * 0.45,
      oxygen_saturation_lower: 94.8 + wave * 0.3, oxygen_saturation_upper: 97.4 + wave * 0.3, skin_temperature_delta: wave * 0.18, nightly_temperature_celsius: 33.4 + wave * 0.18, baseline_temperature_celsius: 33.4,
      steps, active_energy_kcal: 520 + wave * 110, total_energy_kcal: 2_180 + wave * 130, zone_minutes: 31 + wave * 12, light_zone_minutes: 12, moderate_zone_minutes: 10 + wave * 4, vigorous_zone_minutes: 6 + wave * 4, peak_zone_minutes: 3 + wave * 2,
      active_minutes: 52 + wave * 15, sedentary_minutes: 560 - wave * 35, exercise_minutes: 38 + wave * 18, distance_km: steps * 0.00072, running_distance_km: null, running_duration_minutes: null, running_pace_seconds_per_km: null, running_average_heart_rate: null, floors: 11 + wave * 4, weight_kg: 74.2 - index * 0.004, body_fat_percent: 17.4 - index * 0.003, vo2_max: 47.2 + index * 0.012,
      altitude_gain_m: 82 + wave * 25, height_cm: 178, core_body_temperature_celsius: null, blood_glucose_mg_dl: null,
      active_day: steps >= 7_500, active_day_rate_28d: 71, activity_consistency_28d: 78, weekly_load: 408 + wave * 30, acute_chronic_load_ratio: 1.04 + wave * 0.04, data_quality: { providers: ["google_health"], primaryWearable: "Google Health" }, source_freshness: { latestMeasuredAt: date.toISOString() },
    };
  });
  const latestDay = days.at(-1);
  if (latestDay) {
    Object.assign(latestDay, {
      sleep_minutes: 468,
      sleep_need_minutes: 490,
      sleep_regularity: 84,
      hrv_ms: 57,
      resting_heart_rate: 57,
      steps: 8_900,
      zone_minutes: 33,
    });
  }
  const scores = days.flatMap((day, index): ScoreDay[] => {
    const sleep = day.sleep_minutes !== null && day.sleep_need_minutes !== null && day.sleep_efficiency !== null && day.sleep_regularity !== null && day.sleep_need_minutes > 0
      ? calculateSleepScore({
        actualSleepMinutes: day.sleep_minutes,
        estimatedNeedMinutes: day.sleep_need_minutes,
        efficiencyPercent: day.sleep_efficiency,
        regularityPercent: day.sleep_regularity,
      })
      : null;
    const recoveryScore = Math.round(72 + Math.sin(index / 5) * 8 + index * 0.07);
    const hrvDriver = Math.round(Math.min(100, Math.max(0, 72 + Math.sin(index / 5) * 10 + index * 0.04)));
    const restingHeartRateDriver = Math.round(Math.min(100, Math.max(0, 74 - Math.sin(index / 5) * 8 + index * 0.03)));
    const sleepDriver = sleep?.score ?? null;
    return [
      {
        score_date: day.metric_date,
        kind: "sleep",
        score: sleep?.score ?? null,
        drivers: sleep
          ? { duration: sleep.durationComponent, efficiency: sleep.efficiencyComponent, regularity: sleep.regularityComponent }
          : {},
        algorithm_version: sleep?.algorithmVersion ?? null,
      },
      { score_date: day.metric_date, kind: "recovery", score: recoveryScore, drivers: { hrv: hrvDriver, restingHeartRate: restingHeartRateDriver, sleep: sleepDriver, coverage: 1 } },
      (() => {
        const effort = calculateEffortScoreFromAvailable({
          zoneMinutes: day.zone_minutes,
          exerciseMinutes: day.exercise_minutes,
          activeEnergyKcal: day.active_energy_kcal,
          steps: day.steps,
        });
        return {
          score_date: day.metric_date,
          kind: "effort" as const,
          score: effort.score,
          drivers: { coverage: effort.coverage },
          algorithm_version: effort.algorithmVersion,
        };
      })(),
    ];
  });
  const canonicalDays = days.slice(-previewScoreHistory.recovery.length);
  canonicalDays.forEach((day, index) => {
    const scoreIndex = scores.findIndex((score) => score.score_date === day.metric_date);
    scores[scoreIndex + 1] = { ...scores[scoreIndex + 1], score: previewScoreHistory.recovery[index] };
  });
  const lastDate = days.at(-1)?.metric_date ?? now.toISOString().slice(0, 10);
  const lastBedtime = new Date(`${lastDate}T12:00:00Z`);
  lastBedtime.setUTCDate(lastBedtime.getUTCDate() - 1);
  const lastBedtimeDate = lastBedtime.toISOString().slice(0, 10);
  return {
    timezone: "Europe/Paris",
    importedAt: now.toISOString(),
    days,
    scores,
    sleepRecommendation: sleepRecommendationFor({ days, timezone: "Europe/Paris", targetMinutes: 510, wakeTime: "07:00", windDownMinutes: 30 }),
    latestSleepStages: [
      { type: "LIGHT", startTime: `${lastBedtimeDate}T22:48:00Z`, endTime: `${lastBedtimeDate}T23:25:00Z` },
      { type: "DEEP", startTime: `${lastBedtimeDate}T23:25:00Z`, endTime: `${lastDate}T00:30:00Z` },
      { type: "LIGHT", startTime: `${lastDate}T00:30:00Z`, endTime: `${lastDate}T02:10:00Z` },
      { type: "REM", startTime: `${lastDate}T02:10:00Z`, endTime: `${lastDate}T03:02:00Z` },
      { type: "AWAKE", startTime: `${lastDate}T03:02:00Z`, endTime: `${lastDate}T03:10:00Z` },
      { type: "LIGHT", startTime: `${lastDate}T03:10:00Z`, endTime: `${lastDate}T05:12:00Z` },
      { type: "REM", startTime: `${lastDate}T05:12:00Z`, endTime: `${lastDate}T06:58:00Z` },
    ],
    heartRateSamples: Array.from({ length: 48 }, (_, index) => ({ measuredAt: new Date(now.getTime() - (47 - index) * 30 * 60_000).toISOString(), bpm: Math.round(62 + Math.sin(index / 3) * 8 + (index > 27 && index < 32 ? 55 : 0)) })),
    exercises: [
      { id: "preview-run", date: lastDate, name: "Outdoor run", type: "RUNNING", durationMinutes: 44, activeMinutes: 44, calories: 430, distanceKm: 7.2, averageHeartRate: 151, maximumHeartRate: 178, zoneMinutes: 36, averageSpeedKph: 9.8, averagePaceSecondsPerKm: 367, elevationGainMeters: 94, steps: 7240, runVo2Max: 47.8, swimLengths: null, cadence: 168, strideLengthMeters: 1.02, groundContactMilliseconds: 246, verticalOscillationMillimeters: 82, verticalRatio: 8.1, startTime: `${lastDate}T06:00:00.000Z`, endTime: `${lastDate}T06:44:00.000Z`, splits: Array.from({ length: 7 }, (_, index) => ({ startTime: null, endTime: null, activeMinutes: (349 + index * 6) / 60, distanceKm: 1, averagePaceSecondsPerKm: 349 + index * 6 })).concat([{ startTime: null, endTime: null, activeMinutes: 1.2, distanceKm: 0.2, averagePaceSecondsPerKm: 360 }]), heartRateZones: { lightMinutes: 4, moderateMinutes: 12, vigorousMinutes: 16, peakMinutes: 4 } },
      { id: "preview-boxing", date: days.at(-2)?.metric_date ?? lastDate, name: "Boxing", type: "BOXING", startTime: `${days.at(-2)?.metric_date ?? lastDate}T06:00:00.000Z`, endTime: `${days.at(-2)?.metric_date ?? lastDate}T06:45:00.000Z`, durationMinutes: 45, activeMinutes: 45, calories: 410, distanceKm: null, averageHeartRate: 145, maximumHeartRate: 172, zoneMinutes: 30, averageSpeedKph: null, averagePaceSecondsPerKm: null, elevationGainMeters: null, steps: null, runVo2Max: null, swimLengths: null, cadence: null, strideLengthMeters: null, groundContactMilliseconds: null, verticalOscillationMillimeters: null, verticalRatio: null },
      { id: "preview-strength", date: days.at(-3)?.metric_date ?? lastDate, name: "Strength training", type: "WEIGHT_TRAINING", startTime: `${days.at(-3)?.metric_date ?? lastDate}T06:00:00.000Z`, endTime: `${days.at(-3)?.metric_date ?? lastDate}T06:58:00.000Z`, durationMinutes: 58, activeMinutes: 49, calories: 360, distanceKm: null, averageHeartRate: 126, maximumHeartRate: 157, zoneMinutes: 24, averageSpeedKph: null, averagePaceSecondsPerKm: null, elevationGainMeters: null, steps: 1320, runVo2Max: null, swimLengths: null, cadence: null, strideLengthMeters: null, groundContactMilliseconds: null, verticalOscillationMillimeters: null, verticalRatio: null },
    ],
    effortTargets: effortScoreTargets(),
    effortTargetSource: "fallback",
  };
}

type HealthAnalyticsScope = "all" | "sleep" | "recovery" | "activity" | "trends";

const FIRST_SCREEN_DAYS = 30;
const FIRST_SCREEN_SCORE_ROWS = FIRST_SCREEN_DAYS * 3;
const CRITICAL_QUERY_TIMEOUT_MS = 4_000;
const SECONDARY_QUERY_TIMEOUT_MS = 2_500;
const SECONDARY_GRACE_MS = 350;

const metricColumns: Record<HealthAnalyticsScope, string> = {
  all: "*",
  sleep: "metric_date,sleep_minutes,sleep_need_minutes,sleep_efficiency,sleep_regularity,sleep_latency_minutes,sleep_awake_minutes,sleep_awake_percent,sleep_awakenings,sleep_fragmentation,sleep_deep_minutes,sleep_deep_percent,sleep_rem_minutes,sleep_rem_percent,sleep_light_minutes,sleep_light_percent,daily_sleep_debt_minutes,cumulative_sleep_debt_minutes,bedtime,wake_time,data_quality,source_freshness",
  recovery: "metric_date,sleep_minutes,hrv_ms,resting_heart_rate,respiratory_rate,oxygen_saturation,oxygen_saturation_lower,oxygen_saturation_upper,skin_temperature_delta,nightly_temperature_celsius,baseline_temperature_celsius,light_zone_minutes,moderate_zone_minutes,vigorous_zone_minutes,peak_zone_minutes,vo2_max,core_body_temperature_celsius,data_quality,source_freshness",
  activity: "metric_date,steps,active_energy_kcal,total_energy_kcal,zone_minutes,light_zone_minutes,moderate_zone_minutes,vigorous_zone_minutes,peak_zone_minutes,active_minutes,sedentary_minutes,exercise_minutes,distance_km,running_distance_km,running_duration_minutes,running_pace_seconds_per_km,running_average_heart_rate,floors,weight_kg,body_fat_percent,altitude_gain_m,active_day,active_day_rate_28d,activity_consistency_28d,weekly_load,acute_chronic_load_ratio,data_quality,source_freshness",
  trends: "metric_date,sleep_minutes,hrv_ms,resting_heart_rate,steps,data_quality,source_freshness",
};

type QueryResult<T> = { data: T | null; error: unknown | null };

function applyQueryTimeout<T>(query: T, timeoutMs: number): T {
  const withTimeout = (query as { withTimeout?: (value: number) => T }).withTimeout;
  return typeof withTimeout === "function" ? withTimeout.call(query, timeoutMs) : query;
}

function withFallbackTimeout<T>(value: PromiseLike<T>, fallback: T, timeoutMs: number): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      resolve(fallback);
    }, timeoutMs);
    Promise.resolve(value).then((result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    }, () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(fallback);
    });
  });
}

function optionalQuery<T>(query: PromiseLike<QueryResult<T>>, fallback: T, timeoutMs = SECONDARY_QUERY_TIMEOUT_MS): Promise<QueryResult<T>> {
  const fallbackResult: QueryResult<T> = { data: fallback, error: null };
  const settled = Promise.resolve(query).then((result) => result.error ? fallbackResult : { data: result.data ?? fallback, error: null });
  return withFallbackTimeout(settled, fallbackResult, timeoutMs);
}

function optionalValue<T>(value: PromiseLike<T>, fallback: T, timeoutMs = SECONDARY_QUERY_TIMEOUT_MS): Promise<T> {
  return withFallbackTimeout(Promise.resolve(value).catch(() => fallback), fallback, timeoutMs);
}

const recoveryMetricKeys: Array<keyof HealthMetricDay> = [
  "sleep_minutes",
  "hrv_ms",
  "resting_heart_rate",
  "respiratory_rate",
  "oxygen_saturation",
  "oxygen_saturation_lower",
  "oxygen_saturation_upper",
  "skin_temperature_delta",
  "nightly_temperature_celsius",
  "baseline_temperature_celsius",
  "light_zone_minutes",
  "moderate_zone_minutes",
  "vigorous_zone_minutes",
  "peak_zone_minutes",
  "vo2_max",
  "core_body_temperature_celsius",
];

function civilDateIn(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function datePart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return Number(parts.find((part) => part.type === type)?.value ?? NaN);
}

function timeZoneOffsetMillisecondsAt(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const localAsUtc = Date.UTC(
    datePart(parts, "year"),
    datePart(parts, "month") - 1,
    datePart(parts, "day"),
    datePart(parts, "hour"),
    datePart(parts, "minute"),
    datePart(parts, "second"),
  );
  return localAsUtc - value.getTime();
}

function localMidnightUtc(civilDate: string, timeZone: string) {
  const target = new Date(`${civilDate}T00:00:00.000Z`);
  if (!Number.isFinite(target.getTime())) return null;

  // Resolve the timezone offset twice so DST transitions use the offset at the
  // target local midnight rather than the server's timezone or a fixed offset.
  let timestamp = target.getTime();
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const nextTimestamp = target.getTime() - timeZoneOffsetMillisecondsAt(new Date(timestamp), timeZone);
    if (nextTimestamp === timestamp) break;
    timestamp = nextTimestamp;
  }
  return new Date(timestamp);
}

function nextCivilDate(civilDate: string) {
  const value = new Date(`${civilDate}T12:00:00.000Z`);
  if (!Number.isFinite(value.getTime())) return null;
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function latestImportedAt(days: HealthMetricDay[]) {
  return days
    .map((day) => day.data_quality?.importedAt)
    .filter((value): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)))
    .sort((first, second) => Date.parse(second) - Date.parse(first))[0] ?? null;
}

export function heartRateWindowForCivilDate(civilDate: string, timeZone: string) {
  const nextDate = nextCivilDate(civilDate);
  const start = localMidnightUtc(civilDate, timeZone);
  const end = nextDate ? localMidnightUtc(nextDate, timeZone) : null;
  return start && end ? { start: start.toISOString(), end: end.toISOString() } : null;
}

async function loadHealthAnalytics(scope: HealthAnalyticsScope): Promise<HealthAnalytics> {
  if (isLocalPreviewMode()) return buildPreviewAnalytics();
  const user = await getCurrentUser();
  if (!user) return { timezone: "Europe/Paris", importedAt: null, days: [], scores: [], sleepRecommendation: null, latestSleepStages: [], heartRateSamples: [], exercises: [], effortTargets: effortScoreTargets(), effortTargetSource: "fallback" };
  const admin = createCloudflareAdminClient();
  const supabase = await createCloudflareServerClient();
  // Detail reads are useful context, but the daily metrics and persisted scores
  // are the primary page data. Start every read immediately, then give the
  // secondary reads a short budget so one stalled chart cannot hold the page.
  const sleepPromise = scope === "sleep" || scope === "all"
    ? optionalQuery(
      applyQueryTimeout(supabase.from("health_records").select("payload").eq("user_id", user.id).eq("data_type", "sleep").order("civil_date", { ascending: false }).order("end_time", { ascending: false }).limit(1), SECONDARY_QUERY_TIMEOUT_MS).then((result) => result),
      [],
    )
    : Promise.resolve({ data: [], error: null });
  const exercisePromise = scope === "all"
    ? optionalQuery(
      applyQueryTimeout(supabase.from("health_records").select("source_record_id,civil_date,start_time,end_time,payload").eq("user_id", user.id).eq("data_type", "exercise").order("civil_date", { ascending: false }).order("end_time", { ascending: false }).limit(20), SECONDARY_QUERY_TIMEOUT_MS).then((result) => result),
      [],
    )
    : Promise.resolve({ data: [], error: null });
  const activityExercisesPromise = scope === "activity"
    ? applyQueryTimeout(supabase.from("health_records").select("source_record_id,civil_date,start_time,end_time,payload").eq("user_id", user.id).eq("data_type", "exercise").order("civil_date", { ascending: false }).order("end_time", { ascending: false }).limit(3), CRITICAL_QUERY_TIMEOUT_MS)
    : Promise.resolve({ data: [], error: null });
  const effortTargetPromise = scope === "activity" || scope === "all"
    ? optionalValue(loadNutritionTargetsStateForUser(user.id, { timeoutMs: SECONDARY_QUERY_TIMEOUT_MS }), null)
    : Promise.resolve(null);

  const profilePromise = applyQueryTimeout(supabase.from("profiles").select("timezone").eq("user_id", user.id).maybeSingle(), CRITICAL_QUERY_TIMEOUT_MS);
  const metricsPromise = applyQueryTimeout(supabase.from("daily_health_metrics").select(metricColumns[scope]).eq("user_id", user.id).order("metric_date", { ascending: false }).limit(FIRST_SCREEN_DAYS), CRITICAL_QUERY_TIMEOUT_MS);
  const scoresPromise = applyQueryTimeout((() => {
    const query = supabase.from("daily_scores").select("score_date,kind,score,drivers,algorithm_version").eq("user_id", user.id).order("score_date", { ascending: false });
    if (scope === "sleep" || scope === "recovery" || scope === "activity") return query.eq("kind", scope === "activity" ? "effort" : scope).limit(FIRST_SCREEN_DAYS);
    return query.limit(FIRST_SCREEN_SCORE_ROWS);
  })(), CRITICAL_QUERY_TIMEOUT_MS);
  const connectionPromise = optionalQuery(
    applyQueryTimeout(admin.from("provider_connections").select("last_synced_at").eq("user_id", user.id).eq("provider", "google_health").maybeSingle(), SECONDARY_QUERY_TIMEOUT_MS),
    null,
  );
  const sleepPreferencesPromise = scope === "sleep"
    ? optionalQuery(
      applyQueryTimeout(admin.from("sleep_preferences").select("base_target_minutes,usual_wake_time,wind_down_minutes").eq("user_id", user.id).maybeSingle(), SECONDARY_QUERY_TIMEOUT_MS),
      null,
    )
    : Promise.resolve({ data: null, error: null });
  const optionalBasePromise = Promise.all([connectionPromise, sleepPreferencesPromise, effortTargetPromise]);

  const [profileResult, metricsResult, scoresResult, activityExercisesResult] = await Promise.all([
    profilePromise,
    metricsPromise,
    scoresPromise,
    activityExercisesPromise,
  ]);
  const failed = [profileResult, metricsResult, scoresResult, activityExercisesResult].find((result) => result.error);
  if (failed?.error) throw new Error("Health analytics are temporarily unavailable.");
  const [connectionResult, sleepPreferencesResult, effortTargetState] = await optionalValue(
    optionalBasePromise,
    [{ data: null, error: null }, { data: null, error: null }, null] as const,
    SECONDARY_GRACE_MS,
  );
  const [{ data: profile }, { data: metrics }, { data: scores }, { data: connection }, { data: sleepPreferences }] = [profileResult, metricsResult, scoresResult, connectionResult, sleepPreferencesResult];
  const timezone = profile?.timezone ?? "Europe/Paris";
  // A missing nutrition_targets row is not a zero target. The score engine's
  // documented 700 kcal reference remains the safe fallback until the user
  // configures a calorie target.
  const effortTargetSource = effortTargetState?.persisted ? "nutrition_targets" : "fallback";
  const effortTargets = effortScoreTargets({ activeEnergyKcalTarget: effortTargetState?.persisted ? effortTargetState.targets.caloriesKcal.likely : null });
  const orderedMetrics = [...((metrics ?? []) as unknown as HealthMetricDay[])].reverse();
  const latestRecoveryDate = orderedMetrics.findLast((day) => recoveryMetricKeys.some((key) => {
    const value = day[key];
    return typeof value === "number" && Number.isFinite(value);
  }))?.metric_date;
  const heartRateWindow = latestRecoveryDate ? heartRateWindowForCivilDate(latestRecoveryDate, timezone) : null;
  const heartRatePromise = (scope === "recovery" || scope === "all") && heartRateWindow
    ? optionalQuery(
      applyQueryTimeout(supabase.from("health_records").select("measured_at,payload").eq("user_id", user.id).eq("data_type", "heart-rate").gte("measured_at", heartRateWindow.start).lt("measured_at", heartRateWindow.end).order("measured_at", { ascending: false }).limit(2000), SECONDARY_QUERY_TIMEOUT_MS),
      [],
    )
    : Promise.resolve({ data: [], error: null });
  const [sleepResult, heartRateResult, exerciseResult] = await optionalValue(
    Promise.all([sleepPromise, heartRatePromise, exercisePromise]),
    [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }] as const,
    SECONDARY_GRACE_MS,
  );
  const sleeps = sleepResult.data;
  const heartRates = heartRateResult.data;
  const exercises = scope === "activity" ? activityExercisesResult.data : exerciseResult.data;

  const sleep = findObject(sleeps?.[0]?.payload, "sleep");
  const stages = Array.isArray(sleep?.stages) ? sleep.stages : [];
  const latestSleepStages = stages.flatMap((stage): SleepStageSegment[] => {
    if (!isObject(stage) || typeof stage.startTime !== "string" || typeof stage.endTime !== "string") return [];
    const type = String(stage.type) as SleepStageSegment["type"];
    return ["AWAKE", "LIGHT", "DEEP", "REM", "ASLEEP", "RESTLESS"].includes(type) ? [{ type, startTime: stage.startTime, endTime: stage.endTime }] : [];
  });
  const heartRateSamples = (heartRates ?? []).flatMap((record): HeartRateSample[] => {
    const bpm = findNumber(record.payload, ["beatsPerMinute"]);
    return bpm === null || !record.measured_at || (latestRecoveryDate && civilDateIn(record.measured_at, timezone) !== latestRecoveryDate) ? [] : [{ measuredAt: record.measured_at, bpm }];
  }).reverse();
  const exerciseSummaries = (exercises ?? []).map(exerciseSummaryFromRecord);
  const targetMinutes = Number(sleepPreferences?.base_target_minutes);
  const sleepRecommendation = scope === "sleep"
    ? sleepRecommendationFor({
      days: orderedMetrics,
      timezone,
      targetMinutes: Number.isFinite(targetMinutes) && targetMinutes > 0 ? targetMinutes : 510,
      wakeTime: String(sleepPreferences?.usual_wake_time ?? "07:00").slice(0, 5),
      windDownMinutes: Number(sleepPreferences?.wind_down_minutes) || 30,
    })
    : null;
  return {
    timezone,
    importedAt: connection?.last_synced_at ?? latestImportedAt(orderedMetrics),
    days: orderedMetrics,
    scores: [...((scores ?? []) as ScoreDay[])].reverse(),
    sleepRecommendation,
    latestSleepStages,
    heartRateSamples,
    exercises: exerciseSummaries,
    effortTargets,
    effortTargetSource,
  };
}

type ExerciseRecord = { source_record_id: string; civil_date: string | null; start_time: string | null; end_time: string | null; payload: unknown };

export function exerciseSummaryFromRecord(record: ExerciseRecord): ExerciseSummary {
    const exercise = findObject(record.payload, "exercise") ?? {};
    const metricsSummary = isObject(exercise.metricsSummary) ? exercise.metricsSummary : {};
    const interval = isObject(exercise.interval) ? exercise.interval : {};
    const startTime = record.start_time ?? (typeof interval.startTime === "string" ? interval.startTime : null);
    const endTime = record.end_time ?? (typeof interval.endTime === "string" ? interval.endTime : null);
    const distanceMillimeters = findNumber(metricsSummary, ["distanceMillimeters"]);
    const distanceKm = distanceMillimeters === null ? null : distanceMillimeters / 1_000_000;
    const activeDurationMinutes = durationMinutesOrNull(exercise.activeDuration);
    const sourcePaceSecondsPerMeter = findNumber(metricsSummary, ["averagePaceSecondsPerMeter"]);
    const averagePaceSecondsPerKm = sourcePaceSecondsPerMeter === null
      ? activeDurationMinutes !== null && activeDurationMinutes > 0 && distanceKm !== null && distanceKm > 0 ? (activeDurationMinutes * 60) / distanceKm : null
      : sourcePaceSecondsPerMeter * 1000;
    const rawHeartRateZones = isObject(metricsSummary.heartRateZoneDurations) ? metricsSummary.heartRateZoneDurations : null;
    const heartRateZones = rawHeartRateZones ? {
      lightMinutes: durationMinutesOrNull(rawHeartRateZones.lightTime),
      moderateMinutes: durationMinutesOrNull(rawHeartRateZones.moderateTime),
      vigorousMinutes: durationMinutesOrNull(rawHeartRateZones.vigorousTime),
      peakMinutes: durationMinutesOrNull(rawHeartRateZones.peakTime),
    } : null;
    const splits = (Array.isArray(exercise.splitSummaries) ? exercise.splitSummaries : []).flatMap((split): ExerciseSplitSummary[] => {
      if (!isObject(split) || split.splitType !== "DISTANCE") return [];
      const splitMetrics = isObject(split.metricsSummary) ? split.metricsSummary : {};
      const splitDistanceMillimeters = findNumber(splitMetrics, ["distanceMillimeters"]);
      const splitDistanceKm = splitDistanceMillimeters === null ? null : splitDistanceMillimeters / 1_000_000;
      const splitPaceSecondsPerMeter = findNumber(splitMetrics, ["averagePaceSecondsPerMeter"]);
      const splitActiveMinutes = durationMinutesOrNull(split.activeDuration);
      const splitPaceSecondsPerKm = splitPaceSecondsPerMeter === null
        ? splitActiveMinutes !== null && splitActiveMinutes > 0 && splitDistanceKm !== null && splitDistanceKm > 0 ? (splitActiveMinutes * 60) / splitDistanceKm : null
        : splitPaceSecondsPerMeter * 1000;
      return [{
        startTime: typeof split.startTime === "string" ? split.startTime : null,
        endTime: typeof split.endTime === "string" ? split.endTime : null,
        activeMinutes: splitActiveMinutes,
        distanceKm: splitDistanceKm,
        averagePaceSecondsPerKm: splitPaceSecondsPerKm,
      }];
    });
    const duration = record.start_time && record.end_time ? (Date.parse(record.end_time) - Date.parse(record.start_time)) / 60_000 : null;
    return {
      id: record.source_record_id,
      date: record.civil_date ?? record.start_time?.slice(0, 10) ?? "",
      name: String(exercise.displayName ?? exercise.exerciseType ?? "Exercise"),
      type: String(exercise.exerciseType ?? "OTHER"),
      durationMinutes: duration,
      activeMinutes: durationMinutes(exercise.activeDuration),
      calories: findNumber(metricsSummary, ["caloriesKcal"]),
      distanceKm,
      averageHeartRate: findNumber(metricsSummary, ["averageHeartRateBeatsPerMinute"]),
      maximumHeartRate: findNumber(metricsSummary, ["maximumHeartRateBeatsPerMinute", "maxHeartRateBeatsPerMinute", "maximumHeartRate", "maxHeartRate"])
        ?? findNumber(exercise, ["maximumHeartRateBeatsPerMinute", "maxHeartRateBeatsPerMinute", "maximumHeartRate", "maxHeartRate"]),
      zoneMinutes: findNumber(metricsSummary, ["activeZoneMinutes"]),
      averageSpeedKph: (() => { const mm = findNumber(metricsSummary, ["averageSpeedMillimetersPerSecond"]); return mm === null ? null : mm * 0.0036; })(),
      averagePaceSecondsPerKm,
      elevationGainMeters: (() => { const mm = findNumber(metricsSummary, ["elevationGainMillimeters"]); return mm === null ? null : mm / 1000; })(),
      steps: findNumber(metricsSummary, ["steps"]),
      runVo2Max: findNumber(metricsSummary, ["runVo2Max"]),
      swimLengths: findNumber(metricsSummary, ["totalSwimLengths"]),
      cadence: findNumber(metricsSummary, ["avgCadenceStepsPerMinute"]),
      strideLengthMeters: (() => { const mm = findNumber(metricsSummary, ["avgStrideLengthMillimeters"]); return mm === null ? null : mm / 1000; })(),
      groundContactMilliseconds: (() => { const raw = findObject(metricsSummary, "mobilityMetrics")?.avgGroundContactTimeDuration; const minutes = durationMinutes(raw); return minutes === null ? null : minutes * 60_000; })(),
      verticalOscillationMillimeters: findNumber(metricsSummary, ["avgVerticalOscillationMillimeters"]),
      verticalRatio: findNumber(metricsSummary, ["avgVerticalRatio"]),
      startTime,
      endTime,
      splits,
      heartRateZones,
    };
}

export async function allImportedExercises(userId: string, range?: { from: string; to: string }): Promise<ExerciseSummary[]> {
  if (isLocalPreviewMode()) return buildPreviewAnalytics().exercises.filter((exercise) => !range || (exercise.date >= range.from && exercise.date <= range.to));
  const admin = createCloudflareAdminClient();
  const pageSize = 500;
  const records: ExerciseSummary[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const query = admin.from("health_records")
      .select("source_record_id,civil_date,start_time,end_time,payload")
      .eq("user_id", userId).eq("data_type", "exercise");
    if (range) query.gte("civil_date", range.from).lte("civil_date", range.to);
    const { data, error } = await query
      .order("civil_date", { ascending: false }).order("end_time", { ascending: false }).order("source_record_id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error("Exercise history could not be loaded.");
    const page = (data ?? []).map(exerciseSummaryFromRecord);
    records.push(...page);
    if (page.length < pageSize) return records;
  }
}

export async function getPersonalLabActivitySummaries(userId: string, startDate: string, endDate: string): Promise<PersonalLabActivitySummary[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) return [];

  if (isLocalPreviewMode()) {
    return summarizePersonalLabActivities(buildPreviewAnalytics().exercises.filter((exercise) => exercise.date >= startDate && exercise.date <= endDate));
  }

  const admin = createCloudflareAdminClient();
  const pageSize = 500;
  const exercises: ExerciseSummary[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await admin.from("health_records")
      .select("source_record_id,civil_date,start_time,end_time,payload")
      .eq("user_id", userId).eq("data_type", "exercise")
      .gte("civil_date", startDate).lte("civil_date", endDate)
      .order("civil_date", { ascending: false }).order("end_time", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error("Exercise history could not be loaded.");
    const page = (data ?? []).map(exerciseSummaryFromRecord);
    exercises.push(...page);
    if (page.length < pageSize) return summarizePersonalLabActivities(exercises);
  }
}

export function getHealthAnalytics() { return loadHealthAnalytics("all"); }
export function getSleepAnalytics() { return loadHealthAnalytics("sleep"); }
export function getRecoveryAnalytics() { return loadHealthAnalytics("recovery"); }
export function getActivityAnalytics() { return loadHealthAnalytics("activity"); }
export function getTrendsAnalytics() { return loadHealthAnalytics("trends"); }
