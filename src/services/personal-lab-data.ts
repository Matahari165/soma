import { DEFAULT_NUTRITION_TARGETS, nutritionTargetsForEffort } from "@/domain/nutrition-targets";
import type { AnalysisPeriod } from "@/domain/lab/matrix";
import type { MetricRole } from "@/domain/lab/metrics";
import type { ConfirmedMealRecord } from "@/domain/lab/meals";
import type { SomaUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { createCloudflareAdminClient, labMatrixInputRevision } from "@/lib/cloudflare/db";
import { getLabMatrixCacheObject, LAB_MATRIX_CACHE_VERSION } from "@/lib/lab-matrix-cache";
import { loadJournalData } from "@/services/journal";
import { loadConfirmedMealRecords } from "@/services/meals";
import { loadNutritionTargetsForUser } from "@/services/nutrition-targets";
import { listSupplementDefinitions, listSupplementEntries } from "@/services/supplements";
import { addDays, average, buildTodayData, dateInTimezone, effortContextForDate, joinObservations, toNumber, type CalendarDay, type DailyCheckin, type HealthDay, type ScoreDay } from "./personal-lab-today";
import { isCachedMatrix, labMatrixCacheKey, overnightFingerprint, readWindowForStream } from "./personal-lab-analysis";
import { previewData } from "./personal-lab-preview";
import type { PersonalLabCoreData, PersonalLabJournalData, PersonalLabSnapshot, PersonalLabSupplements, PersonalLabToday } from "./personal-lab-types";
import { supplementDefinitionToView, supplementEntryToView } from "@/domain/supplements";

type MatrixCacheState = {
  inputRevision: string;
  analysisDate: string | null;
  cachedMatrix: PersonalLabSnapshot["matrix"] | null;
} | null;

/**
 * Starts every independent source read once. The facade can then compose the
 * same promises into the overview, journal, and analysis streams.
 */
export function loadPersonalLabData(userId: string, options: { periods?: AnalysisPeriod[]; includeAnalysis: boolean }) {
  const admin = createCloudflareAdminClient();
  const readWindow = readWindowForStream(options.includeAnalysis, options.periods);
  const matrixCacheKey = labMatrixCacheKey(options.periods);
  const matrixCachePromise: Promise<MatrixCacheState> = options.includeAnalysis && matrixCacheKey ? (async () => {
    try {
      const [inputRevision, cacheValue] = await Promise.all([
        labMatrixInputRevision(userId),
        getLabMatrixCacheObject(userId, matrixCacheKey),
      ]);
      const cache = cacheValue as Record<string, unknown> | null;
      const cachedMatrix = cache?.inputRevision === inputRevision
        && cache.algorithmVersion === LAB_MATRIX_CACHE_VERSION
        && isCachedMatrix(cache.matrix)
        ? cache.matrix
        : null;
      return { inputRevision, analysisDate: typeof cache?.analysisDate === "string" ? cache.analysisDate : null, cachedMatrix };
    } catch {
      return null;
    }
  })() : Promise.resolve(null);

  const overviewHealthFields = "metric_date,sleep_minutes,sleep_regularity,bedtime,wake_time,sleep_efficiency,sleep_deep_minutes,sleep_rem_minutes,hrv_ms,resting_heart_rate,vigorous_zone_minutes,peak_zone_minutes,running_distance_km,running_duration_minutes,running_pace_seconds_per_km,running_average_heart_rate,data_quality";
  let healthQuery = admin.from("daily_health_metrics").select(options.includeAnalysis ? "*" : overviewHealthFields).eq("user_id", userId).order("metric_date", { ascending: false });
  let scoresQuery = admin.from("daily_scores").select("score_date,kind,score,drivers").eq("user_id", userId).order("score_date", { ascending: false });
  let calendarQuery = admin.from("daily_calendar_metrics").select(options.includeAnalysis ? "metric_date,deep_work_minutes,deep_work_event_count,total_scheduled_minutes,synced_at" : "metric_date,deep_work_minutes").eq("user_id", userId).order("metric_date", { ascending: false });
  let checkinQuery = admin.from("daily_checkins").select(options.includeAnalysis ? "checkin_date,energy,focus,stress,mood,soreness,caffeine_servings,alcohol_servings,late_meal,illness,deep_work_minutes_override" : "checkin_date,energy,focus,deep_work_minutes_override").eq("user_id", userId).order("checkin_date", { ascending: false });
  if (readWindow) {
    healthQuery = healthQuery.gte("metric_date", readWindow.start).limit(readWindow.days);
    scoresQuery = scoresQuery.gte("score_date", readWindow.start).limit(readWindow.days * 3);
    calendarQuery = calendarQuery.gte("metric_date", readWindow.start).limit(readWindow.days);
    checkinQuery = checkinQuery.gte("checkin_date", readWindow.start).limit(readWindow.days);
  }

  // Converting the query builders to real promises starts every independent
  // read now and lets the streamed sections share the same database results.
  const profile = admin.from("profiles").select("timezone").eq("user_id", userId).maybeSingle().then((result) => result);
  const targets = loadNutritionTargetsForUser(userId).catch(() => DEFAULT_NUTRITION_TARGETS);
  const health = healthQuery.then((result) => result);
  const scores = scoresQuery.then((result) => result);
  const calendars = calendarQuery.then((result) => result);
  const checkins = checkinQuery.then((result) => result);
  const connections = admin.from("provider_connections").select("provider,status,last_synced_at").eq("user_id", userId).in("provider", ["google_health", "google_calendar"]).then((result) => result);
  const meals: Promise<readonly ConfirmedMealRecord[]> = loadConfirmedMealRecords(userId, readWindow ? { from: readWindow.start } : {});
  const supplements: Promise<PersonalLabSupplements> = Promise.resolve(profile).then(async (profileResult) => {
    const today = dateInTimezone(profileResult.data?.timezone ?? "Europe/Paris");
    const [definitions, entries] = await Promise.all([
      listSupplementDefinitions(userId),
      listSupplementEntries(userId, { from: addDays(today, -6), to: today }),
    ]);
    return { definitions: definitions.map(supplementDefinitionToView), entries: entries.map(supplementEntryToView), error: null };
  }).catch(() => ({ definitions: [], entries: [], error: "Les compléments sont momentanément indisponibles." }));
  const journal: Promise<PersonalLabJournalData> = Promise.all([profile, meals]).then(([profileResult, mealRecords]) => loadJournalData(userId, {
    ...(readWindow ? { from: readWindow.start } : {}),
    timeZone: profileResult.data?.timezone ?? "Europe/Paris",
    mealRecords,
    ensureDefaults: false,
  }));
  const core: Promise<PersonalLabCoreData> = Promise.all([profile, health, scores, calendars, checkins, connections]).then((results) => {
    const failed = results.find((result) => result.error);
    if (failed?.error) throw new Error("Your Personal Lab is temporarily unavailable.");
    const [profileResult, healthResult, scoresResult, calendarResult, checkinResult, connectionResult] = results;
    return {
      timeZone: profileResult.data?.timezone ?? "Europe/Paris",
      health: (healthResult.data ?? []) as HealthDay[],
      scores: (scoresResult.data ?? []) as ScoreDay[],
      calendars: (calendarResult.data ?? []) as CalendarDay[],
      checkins: (checkinResult.data ?? []).map((row) => ({ ...row, caffeine_servings: toNumber(row.caffeine_servings), alcohol_servings: toNumber(row.alcohol_servings) })) as DailyCheckin[],
      connections: connectionResult.data ?? [],
    };
  });
  const detail: Promise<{ metricPreferenceResult: { data: Array<{ metric_id: string; role: MetricRole }> | null; error: unknown }; matrixCache: MatrixCacheState }> | null = options.includeAnalysis ? Promise.all([
    admin.from("lab_metric_preferences").select("metric_id,role").eq("user_id", userId),
    matrixCachePromise,
  ]).then((results) => {
    const [metricPreferenceResult, matrixCache] = results;
    if (metricPreferenceResult.error) throw new Error("Your Personal Lab is temporarily unavailable.");
    return { metricPreferenceResult: metricPreferenceResult as { data: Array<{ metric_id: string; role: MetricRole }> | null; error: unknown }, matrixCache };
  }) : null;

  return { matrixCacheKey, profile, targets, health, scores, calendars, checkins, connections, meals, supplements, journal, core, detail };
}

export async function getPersonalLabToday(user: SomaUser): Promise<PersonalLabToday> {
  if (isLocalPreviewMode()) {
    const preview = previewData();
    const todayDate = dateInTimezone("Europe/Paris");
    const observations = joinObservations(preview.health, preview.scores, preview.calendars, preview.checkins);
    const today = observations.find((day) => day.date === todayDate);
    const targets = await loadNutritionTargetsForUser(user.id).catch(() => DEFAULT_NUTRITION_TARGETS);
    const todayData = buildTodayData({ ...preview, timeZone: "Europe/Paris", targets });
    return {
      sleepMinutes: today?.sleepMinutes ?? null,
      sleepRegularity: today?.sleepRegularity ?? null,
      recoveryScore: today?.recoveryScore ?? null,
      effortScore: todayData.effortScore,
      effortCoverage: todayData.effortCoverage,
      calorieTarget: todayData.calorieTarget,
      averageSleepMinutes: todayData.averageSleepMinutes,
      averageSleepRegularity: todayData.averageSleepRegularity,
      averageRecoveryScore: todayData.averageRecoveryScore,
      averageEffortScore: todayData.averageEffortScore,
      overnightFingerprint: overnightFingerprint(preview.health.find((day) => day.metric_date === todayDate)),
    };
  }
  const admin = createCloudflareAdminClient();
  const profileResult = await admin.from("profiles").select("timezone").eq("user_id", user.id).maybeSingle();
  if (profileResult.error) throw new Error("Today's signals could not be loaded.");
  const todayDate = dateInTimezone(profileResult.data?.timezone ?? "Europe/Paris");
  const startDate = addDays(todayDate, -29);
  const [healthResult, scoresResult, targets] = await Promise.all([
    admin.from("daily_health_metrics").select("metric_date,sleep_minutes,sleep_regularity,bedtime,wake_time,sleep_efficiency,sleep_latency_minutes,sleep_awake_minutes,sleep_fragmentation,sleep_deep_minutes,sleep_rem_minutes,hrv_ms,resting_heart_rate,respiratory_rate").eq("user_id", user.id).gte("metric_date", startDate).lte("metric_date", todayDate).order("metric_date", { ascending: true }),
    admin.from("daily_scores").select("score_date,kind,score,drivers").eq("user_id", user.id).gte("score_date", startDate).lte("score_date", todayDate).order("score_date", { ascending: true }),
    loadNutritionTargetsForUser(user.id).catch(() => DEFAULT_NUTRITION_TARGETS),
  ]);
  if (healthResult.error || scoresResult.error) throw new Error("Today's signals could not be loaded.");
  const healthRows = (healthResult.data ?? []) as Array<Pick<HealthDay, "metric_date" | "sleep_minutes" | "sleep_regularity" | "bedtime" | "wake_time" | "sleep_efficiency" | "sleep_latency_minutes" | "sleep_awake_minutes" | "sleep_fragmentation" | "sleep_deep_minutes" | "sleep_rem_minutes" | "hrv_ms" | "resting_heart_rate" | "respiratory_rate">>;
  const scoreRows = (scoresResult.data ?? []) as ScoreDay[];
  const todayHealth = healthRows.find((day) => day.metric_date === todayDate);
  const todayScores = scoreRows.filter((score) => score.score_date === todayDate);
  const todayEffort = effortContextForDate(scoreRows, todayDate);
  const effectiveTargets = nutritionTargetsForEffort(targets, todayEffort);
  return {
    sleepMinutes: toNumber(todayHealth?.sleep_minutes),
    sleepRegularity: toNumber(todayHealth?.sleep_regularity),
    recoveryScore: toNumber(todayScores.find((score) => score.kind === "recovery")?.score),
    effortScore: todayEffort.effortScore,
    effortCoverage: todayEffort.effortCoverage,
    calorieTarget: effectiveTargets.caloriesKcal.likely,
    averageSleepMinutes: average(healthRows.map((day) => toNumber(day.sleep_minutes))),
    averageSleepRegularity: average(healthRows.map((day) => toNumber(day.sleep_regularity))),
    averageRecoveryScore: average(scoreRows.filter((score) => score.kind === "recovery").map((score) => toNumber(score.score))),
    averageEffortScore: todayEffort.averageEffortScore,
    overnightFingerprint: overnightFingerprint(todayHealth),
  };
}
