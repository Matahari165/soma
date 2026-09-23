import { aggregateHealthRecords, type NormalizedHealthRecord } from "@/domain/health/aggregate";
import { recordsInsideWearableWindow } from "@/domain/health/wearable-window";
import { generateEveningBrief, generateMorningBrief } from "@/domain/briefs/generate";
import { spearmanCorrelation, type CorrelationPoint } from "@/domain/correlations/spearman";
import { generateHealthInsights } from "@/domain/insights/engine";
import { acuteChronicLoadRatio, activityRegularity, isActiveDay } from "@/domain/metrics/wellness";
import { calculateEffortScoreFromAvailable } from "@/domain/scores/effort";
import { calculateRecoveryScore } from "@/domain/scores/recovery";
import { sleepRegularityScore } from "@/domain/scores/regularity";
import { estimateSleepNeed, recommendBedtimeFromHistory } from "@/domain/scores/sleep-need";
import { calculateSleepScore } from "@/domain/scores/sleep";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { loadNutritionTargetsStateForUser } from "./nutrition-targets";

export const ANALYSIS_DATA_TYPES = [
  "sleep",
  "daily-heart-rate-variability",
  "daily-resting-heart-rate",
  "daily-respiratory-rate",
  "daily-oxygen-saturation",
  "daily-sleep-temperature-derivations",
  "steps",
  "active-zone-minutes",
  "active-energy-burned",
  "time-in-heart-rate-zone",
  "exercise",
  "daily-exercise-summary",
  "active-minutes",
  "altitude",
  "blood-glucose",
  "body-fat",
  "core-body-temperature",
  "daily-vo2-max",
  "distance",
  "floors",
  "height",
  "oxygen-saturation",
  "respiratory-rate-sleep-summary",
  "run-vo2-max",
  "sedentary-period",
  "total-calories",
  "vo2-max",
  "weight",
] as const;

export const DEFAULT_ANALYSIS_WINDOW_DAYS = 45 as const;
export const HISTORICAL_ANALYSIS_WINDOW_DAYS = 90 as const;
export const ANALYSIS_RECORD_PAGE_SIZE = 500 as const;

const ANALYSIS_RECORD_COLUMNS = "id,provider,data_type,civil_date,start_time,end_time,measured_at,source_device,recording_method,payload";

export type RecomputeUserHealthOptions = {
  windowDays?: typeof DEFAULT_ANALYSIS_WINDOW_DAYS | typeof HISTORICAL_ANALYSIS_WINDOW_DAYS;
};

export function rollingAnalysisStart(now: Date, days: number = DEFAULT_ANALYSIS_WINDOW_DAYS) {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

export function analysisWindowFor(now: Date, options: RecomputeUserHealthOptions = {}) {
  const days = options.windowDays ?? DEFAULT_ANALYSIS_WINDOW_DAYS;
  if (days !== DEFAULT_ANALYSIS_WINDOW_DAYS && days !== HISTORICAL_ANALYSIS_WINDOW_DAYS) {
    throw new Error("Health analysis window must be 45 or 90 days.");
  }
  return { days, start: rollingAnalysisStart(now, days) } as const;
}

type AnalysisHealthRecord = NormalizedHealthRecord & { id?: string | null };

function analysisRecordIdentity(record: AnalysisHealthRecord) {
  if (record.id) return `id:${record.id}`;
  return JSON.stringify([
    record.provider ?? null,
    record.data_type,
    record.civil_date,
    record.start_time,
    record.end_time,
    record.measured_at,
    record.source_device ?? null,
    record.recording_method ?? null,
    record.payload,
  ]);
}

/**
 * Reads only the analysis projection and keeps each storage request bounded.
 * The four independent date reads are equivalent to the old OR predicate,
 * while allowing the Cloudflare storage adapter to push a bounded LIMIT and
 * id cursor into both D1 and Supabase. Records matching multiple date fields
 * are deduplicated.
 */
export async function loadHealthRecordsForAnalysis(userId: string, analysisStart: string) {
  const admin = createCloudflareAdminClient();
  const records = new Map<string, AnalysisHealthRecord>();
  const dateFilters = [
    ["civil_date", analysisStart],
    ["end_time", `${analysisStart}T00:00:00.000Z`],
    ["start_time", `${analysisStart}T00:00:00.000Z`],
    ["measured_at", `${analysisStart}T00:00:00.000Z`],
  ] as const;

  for (const [dateColumn, lowerBound] of dateFilters) {
    let afterId: string | null = null;
    for (;;) {
      const query = admin.from("health_records")
        .select(ANALYSIS_RECORD_COLUMNS)
        .eq("user_id", userId)
        .in("data_type", [...ANALYSIS_DATA_TYPES]);
      if (afterId) query.gt("id", afterId);
      const { data, error } = await query
        .gte(dateColumn, lowerBound)
        .order("id", { ascending: true })
        .limit(ANALYSIS_RECORD_PAGE_SIZE);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as AnalysisHealthRecord[];
      for (const record of page) records.set(analysisRecordIdentity(record), record);
      if (page.length < ANALYSIS_RECORD_PAGE_SIZE) break;
      const lastId = page.at(-1)?.id;
      if (!lastId) throw new Error("Health analysis records are missing stable ids.");
      afterId = lastId;
    }
  }

  return [...records.values()].sort((first, second) => String(first.id ?? "").localeCompare(String(second.id ?? "")));
}

function canonicalDerivedValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalDerivedValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !["id", "created_at", "updated_at"].includes(key))
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, item]) => [key, canonicalDerivedValue(item)]));
}

export function changedDerivedRows(
  existingRows: Array<Record<string, unknown>>,
  incomingRows: Array<Record<string, unknown>>,
  identity: (row: Record<string, unknown>) => string,
) {
  const existing = new Map(existingRows.map((row) => [identity(row), JSON.stringify(canonicalDerivedValue(row))]));
  return incomingRows.filter((row) => existing.get(identity(row)) !== JSON.stringify(canonicalDerivedValue(row)));
}

export function healthRecordCoverageDates(records: Array<Pick<NormalizedHealthRecord, "civil_date" | "start_time" | "end_time" | "measured_at">>) {
  const dates = new Set<string>();
  for (const record of records) {
    if (record.civil_date) dates.add(record.civil_date);
    for (const value of [record.start_time, record.end_time, record.measured_at]) {
      if (!value) continue;
      const time = new Date(value).getTime();
      if (!Number.isFinite(time)) continue;
      // Preserve the neighboring civil dates too: a UTC timestamp can belong
      // to the previous or next profile day depending on the user's timezone.
      for (const offset of [-1, 0, 1]) dates.add(new Date(time + offset * 86_400_000).toISOString().slice(0, 10));
    }
  }
  return dates;
}

export function minutesSinceMidnightIn(value: string, timeZone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const result = hour * 60 + minute;
  return Number.isFinite(result) ? result : null;
}

function todayIn(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function formatClock(minutes: number) {
  const hours = Math.floor(minutes / 60) % 24;
  return `${hours.toString().padStart(2, "0")}:${Math.round(minutes % 60).toString().padStart(2, "0")}`;
}

async function deleteStaleDerivedRows(userId: string, analysisStart: string, activeDates: Set<string>) {
  const admin = createCloudflareAdminClient();
  const [metrics, scores] = await Promise.all([
    admin.from("daily_health_metrics").select("metric_date").eq("user_id", userId).gte("metric_date", analysisStart),
    admin.from("daily_scores").select("score_date").eq("user_id", userId).gte("score_date", analysisStart),
  ]);
  if (metrics.error || scores.error) throw new Error("Existing health analysis could not be reconciled.");
  const staleMetricDates = [...new Set((metrics.data ?? []).map((row) => row.metric_date).filter((date) => !activeDates.has(date)))];
  const staleScoreDates = [...new Set((scores.data ?? []).map((row) => row.score_date).filter((date) => !activeDates.has(date)))];
  for (let index = 0; index < staleMetricDates.length; index += 100) {
    const { error } = await admin.from("daily_health_metrics").delete().eq("user_id", userId).in("metric_date", staleMetricDates.slice(index, index + 100));
    if (error) throw new Error("Obsolete health metrics could not be removed.");
  }
  for (let index = 0; index < staleScoreDates.length; index += 100) {
    const { error } = await admin.from("daily_scores").delete().eq("user_id", userId).in("score_date", staleScoreDates.slice(index, index + 100));
    if (error) throw new Error("Obsolete health scores could not be removed.");
  }
}

export async function recomputeUserHealth(userId: string, options: RecomputeUserHealthOptions = {}) {
  const admin = createCloudflareAdminClient();
  // Recent scores need a 30-day baseline. The default bounded 45-day window
  // preserves older derived history; historical/manual jobs can request 90 days.
  const { start: analysisStart } = analysisWindowFor(new Date(), options);
  const [recordsResult, { data: profile, error: profileError }, { data: sleepPreferences, error: sleepPreferencesError }, currentMetrics, currentScores] = await Promise.all([
    loadHealthRecordsForAnalysis(userId, analysisStart)
      .then((data) => ({ data: data as NormalizedHealthRecord[], error: null }))
      .catch((error: unknown) => ({ data: null, error })),
    admin.from("profiles").select("timezone,display_name").eq("user_id", userId).single(),
    admin.from("sleep_preferences").select("base_target_minutes,usual_wake_time,wind_down_minutes").eq("user_id", userId).single(),
    admin.from("daily_health_metrics").select("*").eq("user_id", userId).gte("metric_date", analysisStart),
    admin.from("daily_scores").select("*").eq("user_id", userId).gte("score_date", analysisStart),
  ]);
  if (recordsResult.error || profileError || sleepPreferencesError || currentMetrics.error || currentScores.error) throw new Error("Health inputs could not be read for analysis.");
  const records = recordsResult.data;
  const timezone = profile?.timezone ?? "Europe/Paris";
  const sourceCoverageDates = healthRecordCoverageDates(records ?? []);
  const wearableWindow = recordsInsideWearableWindow((records ?? []) as NormalizedHealthRecord[], timezone);
  const days = aggregateHealthRecords(wearableWindow.records, timezone)
    .filter((day) => day.metric_date >= analysisStart);
  console.info("[health-analysis] source records loaded", {
    recordCount: wearableWindow.records.length,
    dayCount: days.length,
    dataTypes: [...new Set(wearableWindow.records.map((record) => record.data_type))].sort(),
    wearableWindowStart: wearableWindow.startDate,
  });
  if (!days.length) {
    await deleteStaleDerivedRows(userId, analysisStart, sourceCoverageDates);
    console.warn("[health-analysis] no dated health records available", { analysisStart });
    return { days: 0, scores: 0, insights: 0 };
  }

  // The active-energy reference follows the user's configured calorie target.
  // A missing target row is not zero: the score engine resolves null to its
  // deterministic 700 kcal fallback.
  const effortTargetState = await loadNutritionTargetsStateForUser(userId);
  const effortScoreOptions = {
    activeEnergyKcalTarget: effortTargetState.persisted
      ? effortTargetState.targets.caloriesKcal.likely
      : null,
  } as const;

  const configuredSleepTarget = Number(sleepPreferences?.base_target_minutes);
  const baseSleepTarget = Number.isFinite(configuredSleepTarget) && configuredSleepTarget > 0 ? configuredSleepTarget : 510;
  const scoreRows: Record<string, unknown>[] = [];
  const metricRows: Record<string, unknown>[] = [];
  const effortByDate = new Map<string, number | null>();
  const sleepDebtByDate = new Map<string, number | null>();

  for (const [index, day] of days.entries()) {
    const history = days.slice(Math.max(0, index - 30), index);
    const recoveryHistory = day.data_quality.primaryWearable
      ? history.filter((item) => item.data_quality.primaryWearable === day.data_quality.primaryWearable)
      : history;
    const recentSleep = history.map((item) => item.sleep_minutes).filter((value): value is number => value !== null);
    const priorEffort = index ? effortByDate.get(days[index - 1].metric_date) ?? null : null;
    const sleepNeed = estimateSleepNeed({ baseTargetMinutes: baseSleepTarget, recentSleepMinutes: recentSleep, priorDayEffort: priorEffort });
    const regularNights = [...history, day]
      .filter((item) => item.sleep_minutes !== null && item.bedtime && item.wake_time)
      .slice(-14)
      .map((item) => ({ bedtimeMinutes: minutesSinceMidnightIn(item.bedtime as string, timezone), wakeMinutes: minutesSinceMidnightIn(item.wake_time as string, timezone) }))
      .filter((night): night is { bedtimeMinutes: number; wakeMinutes: number } => night.bedtimeMinutes !== null && night.wakeMinutes !== null);
    const regularity = sleepRegularityScore(regularNights);
    const sleep = day.sleep_minutes !== null && day.sleep_efficiency !== null && regularity !== null
      ? calculateSleepScore({ actualSleepMinutes: day.sleep_minutes, estimatedNeedMinutes: sleepNeed.estimatedNeedMinutes, efficiencyPercent: day.sleep_efficiency, regularityPercent: regularity })
      : null;
    const recovery = calculateRecoveryScore({
      currentHrv: day.hrv_ms,
      hrvBaseline: recoveryHistory.map((item) => item.hrv_ms).filter((value): value is number => value !== null).slice(-30),
      currentRestingHeartRate: day.resting_heart_rate,
      restingHeartRateBaseline: recoveryHistory.map((item) => item.resting_heart_rate).filter((value): value is number => value !== null).slice(-30),
      sleepScore: sleep?.score ?? null,
    });
    const effort = calculateEffortScoreFromAvailable({ zoneMinutes: day.zone_minutes, activeEnergyKcal: day.active_energy_kcal, exerciseMinutes: day.exercise_minutes, steps: day.steps }, effortScoreOptions);
    effortByDate.set(day.metric_date, effort.score);
    const weekday = new Date(`${day.metric_date}T12:00:00Z`).getUTCDay();
    const weekStart = index - ((weekday + 6) % 7);
    const weeklyEfforts = days.slice(Math.max(0, weekStart), index + 1)
      .map((item) => effortByDate.get(item.metric_date) ?? null)
      .filter((value): value is number => value !== null);
    const weeklyEffort = weeklyEfforts.length ? weeklyEfforts.reduce((sum, value) => sum + value, 0) : null;
    const bedtimeRecommendation = recommendBedtimeFromHistory({
      wakeTime: String(sleepPreferences?.usual_wake_time ?? "07:00").slice(0, 5),
      sleepNeedMinutes: sleepNeed.estimatedNeedMinutes,
      recentNights: [...history, day].map((item) => ({
        bedtimeMinutes: item.bedtime ? minutesSinceMidnightIn(item.bedtime, timezone) : null,
        efficiencyPercent: item.sleep_efficiency,
      })),
      windDownMinutes: sleepPreferences?.wind_down_minutes ?? 30,
    });

    const dailySleepDebt = day.sleep_minutes === null ? null : sleepNeed.estimatedNeedMinutes - day.sleep_minutes;
    sleepDebtByDate.set(day.metric_date, dailySleepDebt);
    const measuredSleepDebts = days.slice(Math.max(0, index - 13), index + 1)
      .map((item) => sleepDebtByDate.get(item.metric_date) ?? null)
      .filter((value): value is number => value !== null);
    const cumulativeSleepDebt = measuredSleepDebts.length
      ? Math.max(0, Math.round(measuredSleepDebts.reduce((sum, value) => sum + value, 0)))
      : null;
    const recentActivity = days.slice(Math.max(0, index - 27), index + 1).map((item) => ({
      steps: item.steps,
      activeZoneMinutes: item.zone_minutes,
      activeMinutes: item.active_minutes,
      effortScore: effortByDate.get(item.metric_date) ?? null,
    }));
    const regularitySummary = activityRegularity(recentActivity);
    const loadRatio = acuteChronicLoadRatio(days.slice(0, index + 1).map((item) => effortByDate.get(item.metric_date) ?? null));
    metricRows.push({
      user_id: userId,
      ...day,
      sleep_need_minutes: sleepNeed.estimatedNeedMinutes,
      sleep_regularity: regularity,
      daily_sleep_debt_minutes: dailySleepDebt,
      cumulative_sleep_debt_minutes: cumulativeSleepDebt,
      active_day: isActiveDay({ steps: day.steps, activeZoneMinutes: day.zone_minutes, activeMinutes: day.active_minutes }),
      active_day_rate_28d: regularitySummary.activeDayRate,
      activity_consistency_28d: regularitySummary.consistencyScore,
      weekly_load: weeklyEffort,
      acute_chronic_load_ratio: loadRatio,
    });
    scoreRows.push(
      { user_id: userId, score_date: day.metric_date, kind: "sleep", score: sleep?.score ?? null, status: sleep ? (sleep.score >= 80 ? "restorative" : sleep.score >= 60 ? "steady" : "building") : "limited", drivers: sleep ? { duration: sleep.durationComponent, efficiency: sleep.efficiencyComponent, regularity: sleep.regularityComponent, bedtimeRecommendationMinutes: bedtimeRecommendation.bedtimeMinutes } : {}, algorithm_version: sleep?.algorithmVersion ?? "sleep-v0.2" },
      { user_id: userId, score_date: day.metric_date, kind: "recovery", score: recovery.score, status: recovery.status, drivers: recovery.drivers, algorithm_version: recovery.algorithmVersion },
      { user_id: userId, score_date: day.metric_date, kind: "effort", score: effort.score, status: effort.status, drivers: { coverage: effort.coverage }, algorithm_version: effort.algorithmVersion },
    );
  }

  const changedMetricRows = changedDerivedRows(currentMetrics.data ?? [], metricRows, (row) => String(row.metric_date));
  const changedScoreRows = changedDerivedRows(currentScores.data ?? [], scoreRows, (row) => `${row.score_date}:${row.kind}`);
  if (changedMetricRows.length) {
    const { error: metricError } = await admin.from("daily_health_metrics").upsert(changedMetricRows, { onConflict: "user_id,metric_date" });
    if (metricError) throw new Error("Daily health metrics could not be stored.");
  }
  if (changedScoreRows.length) {
    const { error: scoreError } = await admin.from("daily_scores").upsert(changedScoreRows, { onConflict: "user_id,score_date,kind" });
    if (scoreError) throw new Error("Daily health scores could not be stored.");
  }
  await deleteStaleDerivedRows(userId, analysisStart, sourceCoverageDates);

  const scorePoints = (kind: string) => scoreRows.filter((row) => row.kind === kind && typeof row.score === "number").map((row) => ({ date: String(row.score_date), value: Number(row.score) }));
  const bedtimePoints = days.filter((day) => day.bedtime).map((day) => {
    const minutes = minutesSinceMidnightIn(day.bedtime as string, timezone);
    return minutes === null ? null : { date: day.metric_date, value: minutes < 12 * 60 ? minutes + 1440 : minutes };
  }).filter((point): point is { date: string; value: number } => point !== null);
  const correlationDefinitions: Array<{ x: string; y: string; first: CorrelationPoint[]; second: CorrelationPoint[]; lag: number }> = [
    { x: "bedtime", y: "recovery_score", first: bedtimePoints, second: scorePoints("recovery"), lag: 0 },
    { x: "sleep_minutes", y: "recovery_score", first: observationsFromDays(days, "sleep_minutes"), second: scorePoints("recovery"), lag: 0 },
    { x: "effort_score", y: "next_day_recovery_score", first: scorePoints("effort"), second: scorePoints("recovery"), lag: 1 },
  ];
  const dateStart = days.at(0)?.metric_date as string;
  const dateEnd = days.at(-1)?.metric_date as string;
  const { error: correlationError } = await admin.from("correlation_results").upsert(correlationDefinitions.map((definition) => {
    const result = spearmanCorrelation(definition.first, definition.second, definition.lag);
    return { user_id: userId, variable_x: definition.x, variable_y: definition.y, lag_days: definition.lag, coefficient: result.coefficient, sample_size: result.sampleSize, date_start: dateStart, date_end: dateEnd, quality_status: result.quality, explanation: result.coefficient === null ? "At least 15 paired observations are needed." : `Spearman ρ ${result.coefficient?.toFixed(2)} across ${result.sampleSize} paired observations.`, algorithm_version: "spearman-v2" };
  }), { onConflict: "user_id,variable_x,variable_y,lag_days,date_start,date_end" });
  if (correlationError) throw new Error("Health correlations could not be stored.");

  const observations = <K extends "resting_heart_rate" | "hrv_ms" | "sleep_minutes">(key: K) => days.map((day) => ({ date: day.metric_date, value: day[key] })).filter((point): point is { date: string; value: number } => point.value !== null);
  const insights = generateHealthInsights({ restingHeartRate: observations("resting_heart_rate"), hrv: observations("hrv_ms"), sleepMinutes: observations("sleep_minutes") });
  if (insights.length) {
    const { error: insightError } = await admin.from("insights").upsert(insights.map((insight) => ({ user_id: userId, category: insight.category, insight_type: insight.type, title: insight.title, description: insight.description, evidence: insight.evidence, confidence: insight.confidence, rule_version: "insight-rules-v1", evidence_end: days.at(-1)?.metric_date, evidence_start: days.at(-Math.min(days.length, 33))?.metric_date, deduplication_key: insight.deduplicationKey })), { onConflict: "user_id,deduplication_key" });
    if (insightError) throw new Error("Health insights could not be stored.");
  }

  const latest = days.at(-1) as typeof days[number];
  const latestScores = scoreRows.slice(-3) as Array<{ kind: string; score: number | null; drivers: Record<string, unknown> }>;
  const facts = { date: latest.metric_date, sleepMinutes: latest.sleep_minutes, hrvMs: latest.hrv_ms, restingHeartRate: latest.resting_heart_rate, scores: latestScores };
  const sleepScore = latestScores.find((score) => score.kind === "sleep")?.score ?? null;
  const recoveryScore = latestScores.find((score) => score.kind === "recovery")?.score ?? null;
  const effortScore = latestScores.find((score) => score.kind === "effort");
  const bedtimeMinutes = latestScores.find((score) => score.kind === "sleep")?.drivers?.bedtimeRecommendationMinutes;
  const briefInput = { sleepScore, recoveryScore, effortScore: effortScore?.score ?? null, bedtime: typeof bedtimeMinutes === "number" ? formatClock(bedtimeMinutes) : null, insightTitles: insights.map((insight) => insight.title) };
  const briefDate = todayIn(timezone);
  const { error: briefError } = await admin.from("briefs").upsert([
    { user_id: userId, kind: "morning", brief_date: briefDate, deterministic_facts: facts, generated_text: generateMorningBrief(briefInput), ai_generated: false },
    { user_id: userId, kind: "evening", brief_date: briefDate, deterministic_facts: facts, generated_text: generateEveningBrief(briefInput), ai_generated: false },
  ], { onConflict: "user_id,kind,brief_date" });
  if (briefError) throw new Error("Health summaries could not be stored.");
  const result = { days: metricRows.length, scores: scoreRows.length, insights: insights.length };
  console.info("[health-analysis] recompute completed", result);
  return result;
}

function observationsFromDays<K extends "sleep_minutes">(days: ReturnType<typeof aggregateHealthRecords>, key: K) {
  return days.map((day) => ({ date: day.metric_date, value: day[key] })).filter((point): point is CorrelationPoint => point.value !== null);
}
