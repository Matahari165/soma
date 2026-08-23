import { aggregateHealthRecords, type NormalizedHealthRecord } from "@/domain/health/aggregate";
import { recordsInsideWearableWindow } from "@/domain/health/wearable-window";
import { generateEveningBrief, generateMorningBrief, generateWeeklyBrief } from "@/domain/briefs/generate";
import { spearmanCorrelation, type CorrelationPoint } from "@/domain/correlations/spearman";
import { generateHealthInsights } from "@/domain/insights/engine";
import { acuteChronicLoadRatio, activityRegularity, isActiveDay } from "@/domain/metrics/wellness";
import { calculateEffortScoreFromAvailable, calculateEffortTarget, type FitnessGoal } from "@/domain/scores/effort";
import { calculateRecoveryScore } from "@/domain/scores/recovery";
import { sleepRegularityScore } from "@/domain/scores/regularity";
import { estimateSleepNeed, recommendBedtime } from "@/domain/scores/sleep-need";
import { calculateSleepScore } from "@/domain/scores/sleep";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

async function loadAnalysisRecords(userId: string, analysisStart: string) {
  const admin = createSupabaseAdminClient();
  const rows: NormalizedHealthRecord[] = [];
  const analysisStartTime = `${analysisStart}T00:00:00.000Z`;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("health_records")
      .select("id,provider,data_type,civil_date,start_time,end_time,measured_at,source_device,recording_method,payload")
      .eq("user_id", userId)
      .in("data_type", [...ANALYSIS_DATA_TYPES])
      .or(`civil_date.gte.${analysisStart},end_time.gte.${analysisStartTime},start_time.gte.${analysisStartTime},measured_at.gte.${analysisStartTime}`)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) return { data: null, error };
    rows.push(...((data ?? []) as NormalizedHealthRecord[]));
    if (!data || data.length < 1000) return { data: rows, error: null };
  }
}

export function minutesSinceMidnightIn(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function todayIn(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function formatClock(minutes: number) {
  const hours = Math.floor(minutes / 60) % 24;
  return `${hours.toString().padStart(2, "0")}:${Math.round(minutes % 60).toString().padStart(2, "0")}`;
}

function roundedAverage(values: Array<number | null>) {
  const available = values.filter((value): value is number => value !== null);
  return available.length ? Math.round(available.reduce((sum, value) => sum + value, 0) / available.length) : null;
}

async function deleteStaleDerivedRows(userId: string, analysisStart: string, activeDates: Set<string>) {
  const admin = createSupabaseAdminClient();
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

export async function recomputeUserHealth(userId: string) {
  const admin = createSupabaseAdminClient();
  const analysisStart = new Date(Date.now() - 730 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: records, error: recordError }, { data: profile, error: profileError }, { data: sleepPreferences, error: sleepPreferencesError }, { data: goals, error: goalsError }] = await Promise.all([
    loadAnalysisRecords(userId, analysisStart),
    admin.from("profiles").select("timezone,display_name").eq("user_id", userId).single(),
    admin.from("sleep_preferences").select("base_target_minutes,usual_wake_time,wind_down_minutes").eq("user_id", userId).single(),
    admin.from("health_goals").select("goal_type,priority").eq("user_id", userId).is("ended_on", null).order("priority"),
  ]);
  if (recordError || profileError || sleepPreferencesError || goalsError) throw new Error("Health inputs could not be read for analysis.");
  const timezone = profile?.timezone ?? "Europe/Paris";
  const wearableWindow = recordsInsideWearableWindow((records ?? []) as NormalizedHealthRecord[], timezone);
  const days = aggregateHealthRecords(wearableWindow.records, timezone);
  console.info("[health-analysis] source records loaded", {
    recordCount: wearableWindow.records.length,
    dayCount: days.length,
    dataTypes: [...new Set(wearableWindow.records.map((record) => record.data_type))].sort(),
    wearableWindowStart: wearableWindow.startDate,
  });
  if (!days.length) {
    await deleteStaleDerivedRows(userId, analysisStart, new Set());
    console.warn("[health-analysis] no dated health records available", { analysisStart });
    return { days: 0, scores: 0, insights: 0 };
  }

  const baseSleepTarget = sleepPreferences?.base_target_minutes ?? 480;
  const primaryGoal = (goals?.find((goal) => goal.priority === 1)?.goal_type ?? "general_fitness") as FitnessGoal;
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
    const regularNights = [...history, day].filter((item) => item.bedtime && item.wake_time).slice(-14).map((item) => ({ bedtimeMinutes: minutesSinceMidnightIn(item.bedtime as string, timezone), wakeMinutes: minutesSinceMidnightIn(item.wake_time as string, timezone) }));
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
    const effort = calculateEffortScoreFromAvailable({ zoneMinutes: day.zone_minutes, activeEnergyKcal: day.active_energy_kcal, exerciseMinutes: day.exercise_minutes, steps: day.steps });
    effortByDate.set(day.metric_date, effort.score);
    const weekday = new Date(`${day.metric_date}T12:00:00Z`).getUTCDay();
    const weekStart = index - ((weekday + 6) % 7);
    const weeklyEffort = days.slice(Math.max(0, weekStart), index + 1).reduce((sum, item) => sum + (effortByDate.get(item.metric_date) ?? 0), 0);
    const target = calculateEffortTarget({ goal: primaryGoal, recoveryScore: recovery.score, weeklyEffortSoFar: weeklyEffort, daysRemainingIncludingToday: Math.max(1, 7 - ((weekday + 6) % 7)) });
    const regularBedtime = regularNights.length ? regularNights.at(-1)?.bedtimeMinutes ?? 23 * 60 : 23 * 60;
    const bedtimeRecommendation = recommendBedtime({ wakeTime: String(sleepPreferences?.usual_wake_time ?? "07:00").slice(0, 5), sleepNeedMinutes: sleepNeed.estimatedNeedMinutes, recentEfficiencyPercent: day.sleep_efficiency ?? 85, regularBedtimeMinutes: regularBedtime, windDownMinutes: sleepPreferences?.wind_down_minutes ?? 30 });

    const dailySleepDebt = day.sleep_minutes === null ? null : sleepNeed.estimatedNeedMinutes - day.sleep_minutes;
    sleepDebtByDate.set(day.metric_date, dailySleepDebt);
    const cumulativeSleepDebt = Math.max(0, Math.round(days.slice(Math.max(0, index - 13), index + 1).reduce((sum, item) => sum + (sleepDebtByDate.get(item.metric_date) ?? 0), 0)));
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
      { user_id: userId, score_date: day.metric_date, kind: "sleep", score: sleep?.score ?? null, status: sleep ? (sleep.score >= 80 ? "restorative" : sleep.score >= 60 ? "steady" : "building") : "limited", drivers: sleep ? { duration: sleep.durationComponent, efficiency: sleep.efficiencyComponent, regularity: sleep.regularityComponent, bedtimeRecommendationMinutes: bedtimeRecommendation.bedtimeMinutes } : {}, algorithm_version: sleep?.algorithmVersion ?? "sleep-v0.1" },
      { user_id: userId, score_date: day.metric_date, kind: "recovery", score: recovery.score, status: recovery.status, drivers: recovery.drivers, algorithm_version: recovery.algorithmVersion },
      { user_id: userId, score_date: day.metric_date, kind: "effort", score: effort.score, status: effort.status, drivers: { coverage: effort.coverage, ...(effort.score === null ? {} : { targetMinimum: target.minimum, targetMaximum: target.maximum, weeklyMinimum: target.weeklyMinimum, weeklyMaximum: target.weeklyMaximum }) }, algorithm_version: effort.algorithmVersion },
    );
  }

  const { error: metricError } = await admin.from("daily_health_metrics").upsert(metricRows, { onConflict: "user_id,metric_date" });
  if (metricError) throw new Error("Daily health metrics could not be stored.");
  const { error: scoreError } = await admin.from("daily_scores").upsert(scoreRows, { onConflict: "user_id,score_date,kind" });
  if (scoreError) throw new Error("Daily scores could not be stored.");
  await deleteStaleDerivedRows(userId, analysisStart, new Set(days.map((day) => day.metric_date)));

  const scorePoints = (kind: string) => scoreRows.filter((row) => row.kind === kind && typeof row.score === "number").map((row) => ({ date: String(row.score_date), value: Number(row.score) }));
  const bedtimePoints = days.filter((day) => day.bedtime).map((day) => {
    const minutes = minutesSinceMidnightIn(day.bedtime as string, timezone);
    return { date: day.metric_date, value: minutes < 12 * 60 ? minutes + 1440 : minutes };
  });
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
  const effortTarget = effortScore?.drivers?.targetMinimum !== undefined && effortScore.drivers.targetMaximum !== undefined
    ? [Number(effortScore.drivers.targetMinimum), Number(effortScore.drivers.targetMaximum)] as [number, number]
    : null;
  const bedtimeMinutes = latestScores.find((score) => score.kind === "sleep")?.drivers?.bedtimeRecommendationMinutes;
  const briefInput = { sleepScore, recoveryScore, effortScore: effortScore?.score ?? null, effortTarget, bedtime: typeof bedtimeMinutes === "number" ? formatClock(bedtimeMinutes) : null, insightTitles: insights.map((insight) => insight.title) };
  const recentScores = scoreRows.slice(-21) as Array<{ kind: string; score: number | null; drivers: Record<string, unknown> }>;
  const weeklyEffort = recentScores.filter((score) => score.kind === "effort").reduce((sum, score) => sum + (score.score ?? 0), 0);
  const weeklyBrief = generateWeeklyBrief({
    averageSleepScore: roundedAverage(recentScores.filter((score) => score.kind === "sleep").map((score) => score.score)),
    averageRecoveryScore: roundedAverage(recentScores.filter((score) => score.kind === "recovery").map((score) => score.score)),
    weeklyEffort,
    weeklyEffortTarget: effortScore?.drivers?.weeklyMinimum !== undefined && effortScore.drivers.weeklyMaximum !== undefined
      ? [Number(effortScore.drivers.weeklyMinimum), Number(effortScore.drivers.weeklyMaximum)]
      : null,
    insightTitles: briefInput.insightTitles,
  });
  const briefDate = todayIn(timezone);
  const { error: briefError } = await admin.from("briefs").upsert([
    { user_id: userId, kind: "morning", brief_date: briefDate, deterministic_facts: facts, generated_text: generateMorningBrief(briefInput), ai_generated: false },
    { user_id: userId, kind: "evening", brief_date: briefDate, deterministic_facts: facts, generated_text: generateEveningBrief(briefInput), ai_generated: false },
    { user_id: userId, kind: "weekly", brief_date: briefDate, deterministic_facts: { ...facts, periodDays: Math.min(days.length, 7) }, generated_text: weeklyBrief, ai_generated: false },
  ], { onConflict: "user_id,kind,brief_date" });
  if (briefError) throw new Error("Health summaries could not be stored.");
  const result = { days: metricRows.length, scores: scoreRows.length, insights: insights.length };
  console.info("[health-analysis] recompute completed", result);
  return result;
}

function observationsFromDays<K extends "sleep_minutes">(days: ReturnType<typeof aggregateHealthRecords>, key: K) {
  return days.map((day) => ({ date: day.metric_date, value: day[key] })).filter((point): point is CorrelationPoint => point.value !== null);
}
