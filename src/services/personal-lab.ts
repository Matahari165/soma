import { after } from "next/server";
import { DEFAULT_NUTRITION_TARGETS, nutritionTargetsForEffort } from "@/domain/nutrition-targets";
import { apiMealToRecord, MEAL_SLOTS, type MealJournalData } from "@/domain/meal-record";
import type { Meal } from "@/domain/meals";
import type { AnalysisPeriod } from "@/domain/lab/matrix";
import type { SomaUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { LAB_MATRIX_CACHE_VERSION, putLabMatrixCacheObject } from "@/lib/lab-matrix-cache";
import { elapsedServerMs, serverNow } from "@/lib/performance";
import { listPreviewMeals, loadPreviewConfirmedMealRecords } from "@/services/meal-preview";
import { confirmedMealRecordFor } from "@/services/meal-analysis-records";
import { mealToApi } from "@/services/meal-api";
import { loadNutritionTargetsStateForUser } from "@/services/nutrition-targets";
import { loadPersonalLabData, loadPersonalLabMatrixData } from "./personal-lab-data";
import { saveDailyLabRelationSnapshot } from "./lab-relation-history";
import { previewData } from "./personal-lab-preview";
import { buildJournalView, buildOverview, buildPersonalLabMatrix, buildSnapshot } from "./personal-lab-snapshot";
import { dateInTimezone, effortContextForDate } from "./personal-lab-today";
import type { PersonalLabAnalysisTimings, PersonalLabSnapshot, PersonalLabStream } from "./personal-lab-types";

export type { DailyCheckin, PersonalLabHistoryPoint } from "./personal-lab-today";
export type { PersonalLabJournal, PersonalLabOverview, PersonalLabSnapshot, PersonalLabStream, PersonalLabToday } from "./personal-lab-types";
export { getPersonalLabToday } from "./personal-lab-data";
export {
  analysisWindowForPeriods,
  hasReliableActivityCoverage,
  hasReliableOvernightData,
  isImpossibleSameDayTiming,
  isMechanicalRelation,
  labMatrixCacheKey,
  latestLabDate,
  overnightFingerprint,
  readWindowForStream,
  runningDaySeries,
  timingForAutomaticMetric,
} from "./personal-lab-analysis";
export { joinObservations, recentAverages } from "./personal-lab-today";

function mealJournalDataFor(mealRows: readonly Meal[], date: string): MealJournalData {
  const meals = mealRows.filter((meal) => meal.mealDate === date).map((meal) => apiMealToRecord(mealToApi(meal)));
  return {
    date,
    meals: Object.fromEntries(MEAL_SLOTS.map((slot) => [slot, meals.find((meal) => meal.slot === slot) ?? null])) as MealJournalData["meals"],
  };
}

type PersonalLabWriteInput = {
  userId: string;
  matrix: PersonalLabSnapshot["matrix"];
  todayDate: string;
  inputRevision: string | null;
  cacheKey: string | null;
  writeCache: boolean;
  cacheStatus: PersonalLabAnalysisTimings["cacheStatus"];
};

function schedulePersonalLabWrites(input: PersonalLabWriteInput) {
  const tasks: Array<{ name: "matrix-cache" | "relation-history"; run: () => Promise<unknown> }> = [];
  const cacheKey = input.cacheKey;
  const inputRevision = input.inputRevision;
  if (input.writeCache && cacheKey && inputRevision !== null) {
    tasks.push({
      name: "matrix-cache",
      run: () => putLabMatrixCacheObject(input.userId, cacheKey, {
        inputRevision,
        algorithmVersion: LAB_MATRIX_CACHE_VERSION,
        matrix: input.matrix,
        analysisDate: input.todayDate,
        calculatedAt: new Date().toISOString(),
      }),
    });
  }
  if (input.matrix.rows.some((row) => row.period === 90)) {
    tasks.push({
      name: "relation-history",
      run: () => saveDailyLabRelationSnapshot(input.userId, { todayDate: input.todayDate, matrix: input.matrix }, input.inputRevision),
    });
  }
  if (!tasks.length) return;

  after(async () => {
    const completed = await Promise.all(tasks.map(async (task) => {
      const startedAt = serverNow();
      try {
        await task.run();
        return { name: task.name, status: "saved", durationMs: elapsedServerMs(startedAt) };
      } catch {
        console.warn("[personal-lab] deferred write failed", { stage: task.name, category: "personal-lab-analysis", status: "failed" });
        return { name: task.name, status: "failed", durationMs: elapsedServerMs(startedAt) };
      }
    }));
    const history = completed.find((entry) => entry.name === "relation-history");
    console.info("[personal-lab] deferred writes complete", {
      stage: "background",
      category: "personal-lab-analysis",
      cacheStatus: input.cacheStatus,
      historyStatus: history?.status ?? "not-requested",
      historyMs: history?.durationMs ?? 0,
    });
  });
}

export function createPersonalLabStream(user: SomaUser, options: { periods?: AnalysisPeriod[]; includeAnalysis?: boolean } = {}): PersonalLabStream {
  const includeAnalysis = options.includeAnalysis !== false;
  if (isLocalPreviewMode()) {
    const preview = previewData();
    const timeZone = "Europe/Paris";
    const todayDate = dateInTimezone(timeZone);
    const mealRows = listPreviewMeals(user.id);
    const previewMeals = mealRows.flatMap((meal) => {
      const record = confirmedMealRecordFor(meal);
      return record ? [record] : [];
    });
    const input = { user, timeZone, ...preview, meals: previewMeals, requestedPeriods: options.periods, connections: [
      { provider: "google_health", status: "connected", last_synced_at: new Date().toISOString() },
      { provider: "google_calendar", status: "connected", last_synced_at: new Date().toISOString() },
    ] };
    const targetStatePromise = loadNutritionTargetsStateForUser(user.id)
      .then((state) => ({ ...state, fresh: true }))
      .catch(() => ({ targets: DEFAULT_NUTRITION_TARGETS, persisted: false, fresh: false }));
    const targetsPromise = targetStatePromise.then((state) => state.targets);
    const analysisResult = includeAnalysis ? targetsPromise.then((targets) => {
      const buildStartedAt = serverNow();
      const snapshot = buildSnapshot({ ...input, targets });
      return {
        snapshot,
        timings: { cacheMs: 0, dataMs: 0, buildMs: elapsedServerMs(buildStartedAt), cacheStatus: "bypass" as const },
      };
    }) : null;
    return {
      overview: targetsPromise.then((targets) => buildOverview({ ...input, targets, greetingName: user.displayName })),
      activityDate: Promise.resolve(todayDate),
      journal: targetStatePromise.then((targetState) => {
        const effortTargetContext = effortContextForDate(input.scores, todayDate, "load");
        return buildJournalView(input.timeZone, input.journal, input.meals, input.health, undefined, {
          mealData: mealJournalDataFor(mealRows, todayDate),
          targets: targetState.targets,
          effectiveTargets: nutritionTargetsForEffort(targetState.targets, effortTargetContext),
          effortTargetContext,
          targetsPersisted: targetState.persisted,
          targetsFresh: targetState.fresh,
        });
      }),
      analysis: analysisResult?.then((result) => result.snapshot) ?? null,
      analysisTimings: analysisResult?.then((result) => result.timings, () => ({ cacheMs: 0, dataMs: 0, buildMs: 0, cacheStatus: "unavailable" as const })) ?? null,
    };
  }

  const dataStartedAt = serverNow();
  const loaded = loadPersonalLabData(user.id, { periods: options.periods, includeAnalysis });
  const activityDate = Promise.resolve(loaded.profile).then((profileResult) => {
    if (profileResult.error) throw new Error("Your Personal Lab is temporarily unavailable.");
    return dateInTimezone(profileResult.data?.timezone ?? "Europe/Paris");
  });
  const overview = Promise.all([loaded.core, loaded.meals, loaded.targets]).then(([core, meals, targets]) => buildOverview({ ...core, meals, targets, greetingName: user.displayName }));
  const journal = Promise.all([loaded.profile, loaded.journal, loaded.meals, loaded.supplements, loaded.initialMealData, loaded.targetsState, loaded.core]).then(([profileResult, journalData, meals, supplements, initialMealData, targetState, core]) => {
    if (profileResult.error) throw new Error("Your Personal Lab is temporarily unavailable.");
    const timeZone = profileResult.data?.timezone ?? "Europe/Paris";
    const todayDate = dateInTimezone(timeZone);
    const effortTargetContext = effortContextForDate(core.scores, todayDate, "load");
    return buildJournalView(timeZone, journalData, meals, [], supplements, {
      mealData: initialMealData.date === todayDate ? initialMealData.data : undefined,
      targets: targetState.targets,
      effectiveTargets: nutritionTargetsForEffort(targetState.targets, effortTargetContext),
      effortTargetContext,
      targetsPersisted: targetState.persisted,
      targetsFresh: targetState.fresh,
    });
  });
  const analysisResult = includeAnalysis ? Promise.all([loaded.core, loaded.journal, loaded.meals, loaded.targets, loaded.detail!, loaded.connections]).then(([core, journalData, meals, targets, detail, connectionResult]) => {
    if (connectionResult.error) throw new Error("Your Personal Lab is temporarily unavailable.");
    const dataMs = elapsedServerMs(dataStartedAt);
    const buildStartedAt = serverNow();
    const snapshot = buildSnapshot({
      user,
      ...core,
      connections: connectionResult.data ?? [],
      journal: journalData,
      meals,
      targets,
      metricPreferences: detail.metricPreferenceResult.data ?? [],
      requestedPeriods: options.periods,
      cachedMatrix: detail.matrixCache?.analysisDate === dateInTimezone(core.timeZone)
        ? detail.matrixCache.cachedMatrix ?? undefined
        : undefined,
    });
    const reusedCache = detail.matrixCache?.analysisDate === snapshot.todayDate && Boolean(detail.matrixCache.cachedMatrix);
    const buildMs = elapsedServerMs(buildStartedAt);
    const cacheStatus: PersonalLabAnalysisTimings["cacheStatus"] = detail.matrixCache
      ? reusedCache ? "hit" : "miss"
      : "unavailable";
    schedulePersonalLabWrites({
      userId: user.id,
      matrix: snapshot.matrix,
      todayDate: snapshot.todayDate,
      inputRevision: detail.matrixCache?.inputRevision ?? null,
      cacheKey: loaded.matrixCacheKey,
      writeCache: !reusedCache,
      cacheStatus,
    });
    console.info("[personal-lab] snapshot ready", {
      stage: "snapshot",
      category: "personal-lab-analysis",
      cacheStatus,
      cacheMs: detail.matrixCache?.cacheMs ?? 0,
      dataMs,
      buildMs,
    });
    return {
      snapshot,
      timings: { cacheMs: detail.matrixCache?.cacheMs ?? 0, dataMs, buildMs, cacheStatus },
    };
  }) : null;
  return {
    overview,
    journal,
    activityDate,
    analysis: analysisResult?.then((result) => result.snapshot) ?? null,
    analysisTimings: analysisResult?.then((result) => result.timings, () => ({ cacheMs: 0, dataMs: 0, buildMs: 0, cacheStatus: "unavailable" as const })) ?? null,
  };
}

export function getPersonalLabSnapshot(user: SomaUser, options: { periods?: AnalysisPeriod[] } = {}): Promise<PersonalLabSnapshot> {
  const analysis = createPersonalLabStream(user, options).analysis;
  if (!analysis) return Promise.reject(new Error("Personal Lab analysis is unavailable."));
  return analysis;
}

export async function getPersonalLabSnapshotWithTimings(user: SomaUser, options: { periods?: AnalysisPeriod[] } = {}) {
  const stream = createPersonalLabStream(user, options);
  if (!stream.analysis) throw new Error("Personal Lab analysis is unavailable.");
  const [snapshot, timings] = await Promise.all([
    stream.analysis,
    stream.analysisTimings ?? Promise.resolve({ cacheMs: 0, dataMs: 0, buildMs: 0, cacheStatus: "unavailable" as const }),
  ]);
  return { snapshot, timings };
}

export async function getPersonalLabMatrixWithTimings(user: SomaUser, period: AnalysisPeriod, options: { persist?: boolean } = {}) {
  if (isLocalPreviewMode()) {
    const preview = previewData();
    const buildStartedAt = serverNow();
    const matrix = buildPersonalLabMatrix({
      ...preview,
      timeZone: "Europe/Paris",
      meals: loadPreviewConfirmedMealRecords(user.id),
      metricPreferences: [],
      requestedPeriods: [period],
    });
    return {
      matrix,
      timings: { cacheMs: 0, dataMs: 0, buildMs: elapsedServerMs(buildStartedAt), cacheStatus: "bypass" as const },
    };
  }

  const loaded = await loadPersonalLabMatrixData(user.id, period);
  let matrix = loaded.matrix;
  let buildMs = 0;
  if (!matrix) {
    if (!loaded.health || !loaded.scores || !loaded.meals || !loaded.journal || !loaded.metricPreferences) {
      throw new Error("Your Personal Lab is temporarily unavailable.");
    }
    const buildStartedAt = serverNow();
    matrix = buildPersonalLabMatrix({
      timeZone: loaded.timeZone,
      health: loaded.health,
      scores: loaded.scores,
      calendars: [],
      checkins: [],
      journal: loaded.journal,
      meals: loaded.meals,
      metricPreferences: loaded.metricPreferences,
      requestedPeriods: [period],
    });
    buildMs = elapsedServerMs(buildStartedAt);
  }

  const cacheStatus = loaded.cacheStatus;
  if (options.persist !== false) {
    schedulePersonalLabWrites({
      userId: user.id,
      matrix,
      todayDate: loaded.todayDate,
      inputRevision: loaded.inputRevision,
      cacheKey: loaded.cacheKey,
      writeCache: cacheStatus !== "hit",
      cacheStatus,
    });
  }
  return { matrix, timings: { ...loaded.timings, buildMs, cacheStatus } };
}

export async function getPersonalLabMatrix(user: SomaUser, period: AnalysisPeriod, options: { persist?: boolean } = {}) {
  return (await getPersonalLabMatrixWithTimings(user, period, options)).matrix;
}
