import { DEFAULT_NUTRITION_TARGETS } from "@/domain/nutrition-targets";
import type { AnalysisPeriod } from "@/domain/lab/matrix";
import type { SomaUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { LAB_MATRIX_CACHE_VERSION, putLabMatrixCacheObject } from "@/lib/lab-matrix-cache";
import { loadPreviewConfirmedMealRecords } from "@/services/meal-preview";
import { loadNutritionTargetsForUser } from "@/services/nutrition-targets";
import { loadPersonalLabData } from "./personal-lab-data";
import { previewData } from "./personal-lab-preview";
import { buildJournalView, buildOverview, buildSnapshot } from "./personal-lab-snapshot";
import type { PersonalLabSnapshot, PersonalLabStream } from "./personal-lab-types";

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

export function createPersonalLabStream(user: SomaUser, options: { periods?: AnalysisPeriod[]; includeAnalysis?: boolean } = {}): PersonalLabStream {
  const includeAnalysis = options.includeAnalysis !== false;
  if (isLocalPreviewMode()) {
    const preview = previewData();
    const input = { user, timeZone: "Europe/Paris", ...preview, meals: loadPreviewConfirmedMealRecords(user.id), requestedPeriods: options.periods, connections: [
      { provider: "google_health", status: "connected", last_synced_at: new Date().toISOString() },
      { provider: "google_calendar", status: "connected", last_synced_at: new Date().toISOString() },
    ] };
    const targetsPromise = loadNutritionTargetsForUser(user.id).catch(() => DEFAULT_NUTRITION_TARGETS);
    return {
      overview: targetsPromise.then((targets) => buildOverview({ ...input, targets, greetingName: user.displayName })),
      journal: Promise.resolve(buildJournalView(input.timeZone, input.journal, input.meals, input.health)),
      analysis: includeAnalysis ? targetsPromise.then((targets) => buildSnapshot({ ...input, targets })) : null,
    };
  }

  const loaded = loadPersonalLabData(user.id, { periods: options.periods, includeAnalysis });
  const overview = Promise.all([loaded.core, loaded.meals, loaded.targets]).then(([core, meals, targets]) => buildOverview({ ...core, meals, targets, greetingName: user.displayName }));
  const journal = Promise.all([loaded.profile, loaded.journal, loaded.meals, loaded.supplements]).then(([profileResult, journalData, meals, supplements]) => {
    if (profileResult.error) throw new Error("Your Personal Lab is temporarily unavailable.");
    return buildJournalView(profileResult.data?.timezone ?? "Europe/Paris", journalData, meals, [], supplements);
  });
  const analysis = includeAnalysis ? Promise.all([loaded.core, loaded.journal, loaded.meals, loaded.targets, loaded.detail!]).then(async ([core, journalData, meals, targets, detail]) => {
    const snapshot = buildSnapshot({
      user,
      ...core,
      journal: journalData,
      meals,
      targets,
      metricPreferences: detail.metricPreferenceResult.data ?? [],
      requestedPeriods: options.periods,
      cachedMatrix: detail.matrixCache?.cachedMatrix ?? undefined,
    });
    if (loaded.matrixCacheKey && detail.matrixCache && !detail.matrixCache.cachedMatrix) {
      await putLabMatrixCacheObject(user.id, loaded.matrixCacheKey, {
        inputRevision: detail.matrixCache.inputRevision,
        algorithmVersion: LAB_MATRIX_CACHE_VERSION,
        matrix: snapshot.matrix,
        calculatedAt: new Date().toISOString(),
      }).catch(() => console.warn("[personal-lab] matrix cache write failed", { stage: "matrix-cache", category: "write" }));
    }
    console.info("[personal-lab] snapshot ready", {
      stage: "snapshot",
      category: "personal-lab-analysis",
    });
    return snapshot;
  }) : null;
  return { overview, journal, analysis };
}

export function getPersonalLabSnapshot(user: SomaUser, options: { periods?: AnalysisPeriod[] } = {}): Promise<PersonalLabSnapshot> {
  const analysis = createPersonalLabStream(user, options).analysis;
  if (!analysis) return Promise.reject(new Error("Personal Lab analysis is unavailable."));
  return analysis;
}
