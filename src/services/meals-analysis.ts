import "server-only";

import {
  MAX_MEAL_PHOTOS,
  validateMealAnalysis,
  type MealAnalysisCorrection,
} from "@/domain/meals";
import { isXaiVisionMimeType, MealVisionError, type MealVisionProvider } from "@/integrations/xai/meal-vision";
import { analyzeMealInputWithFallback, getConfiguredMealAnalysisProvider } from "@/integrations/meal-analysis/provider-chain";
import * as cloudflareDb from "@/lib/cloudflare/db";
import { findRelevantMealRecipeReferences } from "@/services/meal-recipes";
import { getR2MealPhotoObject } from "@/lib/r2";
import {
  findActiveMealAnalysis,
  findLatestMealAnalysis,
  findMeal,
  findMealAnalysisByRequestId,
  findQueuedMealAnalysis,
  insertMealAnalysis,
  listRetryableFailedMealAnalyses,
  listQueuedMealAnalyses,
  touchMealAnalysis,
  updateMeal,
  updateMealAnalysis,
  type AnalysisRow,
} from "@/repositories/meals";

import {
  ANALYSIS_HEARTBEAT_MS,
  ANALYSIS_LEASE_TTL_MS,
  FAILED_ANALYSIS_PHOTO_TTL_MS,
  MAX_AUTOMATIC_ANALYSIS_RETRIES,
  RETRY_BACKOFF_MS,
  analysisSourceStillCurrent,
  assertMealId,
  claimMealLease,
  computeMealSourceFingerprint,
  isRetryableAnalysisCode,
  logMeal,
  MealServiceError,
  releaseMealLease,
  timedMealStage,
} from "./meals-shared";
import { loadMealPhotoForAnalysis, purgeMealPhoto } from "./meals-photos";

const { refreshCloudflareLockWithToken } = cloudflareDb;

// Keep this candidate list aligned with isRetryableAnalysisCode: the service
// rechecks it after the database has narrowed the retry scan.
const RETRYABLE_ANALYSIS_CODE_VALUES = [
  "provider_rate_limited",
  "provider_request",
  "provider_timeout",
  "provider_unavailable",
  "provider_empty_response",
  "response_parse_error",
  "response_schema_error",
  "storage_error",
  "unknown_analysis_error",
] as const;

export async function finalizeMealAnalysis(userId: string, mealId: string, analysis: Partial<Pick<AnalysisRow, "id" | "source_fingerprint" | "source_photo_ids">> & { sourceFingerprint?: string | null; sourcePhotoIds?: string[]; result?: unknown | null }) {
  if (!analysis.result) return null;
  const meal = await findMeal(userId, mealId);
  if (!meal) throw new MealServiceError("not_found", "Meal not found.");
  if (meal.entryState === "skipped") throw new MealServiceError("invalid", "Réactive ce créneau avant de lancer l’analyse.");
  const currentFingerprint = await computeMealSourceFingerprint({ note: meal.note, photos: meal.photos });
  // Never confirm or purge evidence that was added after this analysis began.
  // The next explicit analysis will use the new source snapshot.
  const sourceFingerprint = analysis.source_fingerprint ?? analysis.sourceFingerprint ?? null;
  if (sourceFingerprint && sourceFingerprint !== currentFingerprint) {
    logMeal("warn", "finalize_source_changed");
    // Do not let a late result become the newest successful analysis for a
    // meal whose note/photos changed while the provider was running. Keeping
    // the row as failed lets the previous successful result remain selectable
    // while the next enqueue uses the new source fingerprint.
    if (analysis.id) {
      await updateMealAnalysis(userId, analysis.id, {
        status: "failed",
        error: "Les preuves du repas ont changé pendant l’analyse.",
        error_code: "source_unavailable",
        completed_at: new Date().toISOString(),
        retry_after_at: null,
      }, "completed").catch((error) => {
        logMeal("warn", "finalize_source_changed_retire", error);
      });
    }
    return meal;
  }
  await updateMeal(userId, mealId, { status: "confirmed" });
  // Confirmation closes the evidence window for the whole meal. Purge every
  // remaining binary, including legacy rows whose analysis did not persist a
  // complete sourcePhotoIds list; provenance stays in the analysis metadata.
  const photosToPurge = meal.photos.filter((photo) => (photo.storageStatus ?? "available") !== "purged");
  await Promise.all(photosToPurge.map(async (photo) => {
    try {
      await timedMealStage("photo_purge", () => purgeMealPhoto(userId, mealId, photo));
    } catch (error) {
      // Confirmation must never depend on the availability of R2. The pending
      // D1 state is enough for the scheduled reconciler to retry safely.
      logMeal("warn", "photo_purge_deferred", error);
    }
  }));
  return findMeal(userId, mealId);
}
type MealAnalysisEnqueueOptions = {
  force?: boolean;
  correction?: MealAnalysisCorrection;
  analysisRequestId?: string;
  provider?: Pick<MealVisionProvider, "name" | "model">;
};

/**
 * Persists an analysis request and returns immediately. The provider is not
 * contacted here: this boundary is intentionally safe to call from a mobile
 * request that may be interrupted when the app is backgrounded.
 */
export async function enqueueMealAnalysis(userId: string, mealId: string, options: MealAnalysisEnqueueOptions = {}) {
  assertMealId(mealId);
  if (options.analysisRequestId && !/^[a-zA-Z0-9._:-]{8,160}$/.test(options.analysisRequestId)) {
    throw new MealServiceError("invalid", "The analysis request id is invalid.");
  }
  const enqueueLockKey = `meal-analysis-enqueue:${userId}:${mealId}`;
  const enqueueLease = await claimMealLease(enqueueLockKey, userId, ANALYSIS_LEASE_TTL_MS);
  if (!enqueueLease.claimed) {
    const [sameRequest, active] = await Promise.all([
      options.analysisRequestId ? findMealAnalysisByRequestId(userId, mealId, options.analysisRequestId) : Promise.resolve(null),
      findActiveMealAnalysis(userId, mealId),
    ]);
    if (sameRequest) {
      if (sameRequest.status === "failed") throw new MealServiceError("unavailable", sameRequest.error ?? "L’analyse du repas a échoué. Réessaie.", sameRequest.errorCode ?? "unknown_analysis_error");
      return { analysis: sameRequest, fresh: false, queued: sameRequest.status === "queued" || sameRequest.status === "running" };
    }
    if (active) return { analysis: active, fresh: false, queued: true };
    throw new MealServiceError("conflict", "Cette analyse est déjà en cours.");
  }
  try {
    return await enqueueMealAnalysisLocked(userId, mealId, options);
  } finally {
    await releaseMealLease(enqueueLockKey, userId, enqueueLease.token).catch((error) => {
      logMeal("warn", "enqueue_lease_release", error);
    });
  }
}

async function enqueueMealAnalysisLocked(userId: string, mealId: string, options: MealAnalysisEnqueueOptions) {
  const meal = await findMeal(userId, mealId);
  if (!meal) throw new MealServiceError("not_found", "Meal not found.");
  if (meal.entryState === "skipped") throw new MealServiceError("invalid", "Réactive ce créneau avant de lancer l’analyse.");
  const [requestMatch, active, latest] = await Promise.all([
    options.analysisRequestId ? findMealAnalysisByRequestId(userId, mealId, options.analysisRequestId) : Promise.resolve(null),
    findActiveMealAnalysis(userId, mealId),
    findLatestMealAnalysis(userId, mealId),
  ]);
  if (requestMatch) {
    if (requestMatch.status === "failed") {
      throw new MealServiceError("unavailable", requestMatch.error ?? "L’analyse du repas a échoué. Réessaie.", requestMatch.errorCode ?? "unknown_analysis_error");
    }
    return { analysis: requestMatch, fresh: false, queued: requestMatch.status === "queued" || requestMatch.status === "running" };
  }
  if (active) return { analysis: active, fresh: false, queued: true };

  const note = meal.note?.trim() ?? "";
  const availablePhotos = meal.photos.filter((photo) => (photo.storageStatus ?? "available") === "available");
  const hasCorrection = Boolean(options.correction?.trim());
  if (!availablePhotos.length && !note && !hasCorrection) {
    const lastSuccessful = meal.lastSuccessfulAnalysis ?? (latest?.status === "completed" && latest.result ? latest : null);
    if (lastSuccessful) return { analysis: lastSuccessful, fresh: false, queued: false };
    throw new MealServiceError("invalid", "Ajoute une photo ou une courte description avant l'analyse.");
  }
  if (availablePhotos.length > MAX_MEAL_PHOTOS) throw new MealServiceError("invalid", `Un repas ne peut pas contenir plus de ${MAX_MEAL_PHOTOS} photos pour l’analyse.`);
  if (availablePhotos.length && !availablePhotos.every((photo) => isXaiVisionMimeType(photo.mimeType))) {
    throw new MealServiceError("invalid", "Les photos de ce repas doivent être en JPEG ou PNG avant l’analyse.");
  }
  const sourceFingerprint = await computeMealSourceFingerprint({ note: meal.note, photos: meal.photos });
  const lastSuccessful = meal.lastSuccessfulAnalysis ?? (latest?.status === "completed" && latest.result ? latest : null);
  if (!hasCorrection && !options.force && lastSuccessful?.sourceFingerprint === sourceFingerprint) return { analysis: lastSuccessful, fresh: false, queued: false };

  const configured = options.provider ?? getConfiguredMealAnalysisProvider();
  const row: AnalysisRow = {
    id: crypto.randomUUID(),
    user_id: userId,
    meal_id: mealId,
    status: "queued",
    provider: configured.name,
    model: configured.model,
    analysis_request_id: options.analysisRequestId ?? null,
    source_revision: meal.updatedAt,
    result: null,
    error: null,
    error_code: null,
    source_fingerprint: sourceFingerprint,
    source_photo_ids: availablePhotos.map((photo) => photo.id),
    source_note: note || null,
    source_meal_date: meal.mealDate,
    source_meal_type: meal.mealType,
    source_correction: options.correction ?? null,
    source_previous_analysis: lastSuccessful?.result ?? null,
    attempts: 0,
    heartbeat_at: null,
    lease_token: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
  };
  try {
    const analysis = await insertMealAnalysis(row);
    return { analysis, fresh: true, queued: true };
  } catch (error) {
    // Partial unique indexes make this race-safe across two enqueue requests:
    // whichever insert wins is the durable job both callers can observe.
    const [sameRequest, concurrent] = await Promise.all([
      options.analysisRequestId ? findMealAnalysisByRequestId(userId, mealId, options.analysisRequestId) : Promise.resolve(null),
      findActiveMealAnalysis(userId, mealId),
    ]);
    if (sameRequest) return { analysis: sameRequest, fresh: false, queued: sameRequest.status === "queued" || sameRequest.status === "running" };
    if (concurrent) return { analysis: concurrent, fresh: false, queued: true };
    logMeal("error", "enqueue", error);
    throw new MealServiceError("unavailable", "L’analyse du repas n’a pas pu être mise en file.", "storage_error");
  }
}

/** Requeue transient failures while their source photos are still available. */
export async function requeueRetryableMealAnalyses(now = Date.now()) {
  const nowIso = new Date(now).toISOString();
  const rows = await listRetryableFailedMealAnalyses({
    now: nowIso,
    retentionCutoff: new Date(now - FAILED_ANALYSIS_PHOTO_TTL_MS).toISOString(),
    retryableCodes: RETRYABLE_ANALYSIS_CODE_VALUES,
    maxAttempts: MAX_AUTOMATIC_ANALYSIS_RETRIES,
    limit: 100,
  });
  let requeued = 0;
  for (const row of rows) {
    const failedAt = Date.parse(String(row.failure_started_at ?? row.completed_at ?? row.updated_at ?? row.created_at));
    if (!Number.isFinite(failedAt) || now - failedAt >= FAILED_ANALYSIS_PHOTO_TTL_MS) continue;
    if (!isRetryableAnalysisCode(row.error_code) || Number(row.attempts ?? 0) >= MAX_AUTOMATIC_ANALYSIS_RETRIES) continue;
    const retryAt = typeof row.retry_after_at === "string" ? Date.parse(row.retry_after_at) : 0;
    if (Number.isFinite(retryAt) && retryAt > now) continue;
    try {
      await updateMealAnalysis(String(row.user_id), String(row.id), {
        status: "queued",
        error: null,
        // Keep only the coarse failure category as input to the next provider
        // attempt. The worker clears it again when it claims the queued job.
        error_code: row.error_code === "response_schema_error" ? "response_schema_error" : null,
        heartbeat_at: null,
        lease_token: null,
        completed_at: null,
        retry_after_at: null,
      }, "failed");
      requeued += 1;
    } catch (error) {
      logMeal("warn", "retry_requeue", error);
    }
  }
  return requeued;
}

function workerFailure(error: unknown) {
  const visionError = error instanceof MealVisionError ? error : null;
  return {
    message: error instanceof MealServiceError ? error.message : visionError?.message ?? "L’analyse du repas a échoué. Réessaie.",
    code: error instanceof MealServiceError ? error.diagnosticCode ?? "source_unavailable" : visionError?.code ?? "unknown_analysis_error",
  } as const;
}

/**
 * Claims one durable job, executes it outside the UI request, and commits the
 * result only while its persisted lease token still owns the row.
 */
export async function processNextMealAnalysis(target?: { userId: string; analysisId: string }) {
  const candidate = target
    ? await findQueuedMealAnalysis(target.userId, target.analysisId)
    : (await listQueuedMealAnalyses(1))[0];
  if (!candidate) return { processed: false as const, analysis: null };
  const lockKey = `meal-analysis-job:${candidate.id}`;
  const lease = await claimMealLease(lockKey, candidate.user_id, ANALYSIS_LEASE_TTL_MS);
  if (!lease.claimed) return { processed: false as const, analysis: null };
  const leaseToken = lease.token ?? crypto.randomUUID();
  const requestId = typeof candidate.analysis_request_id === "string" ? candidate.analysis_request_id : undefined;
  const queuedAt = Date.parse(String(candidate.created_at));
  if (Number.isFinite(queuedAt)) {
    logMeal("info", "queue_wait", undefined, Math.max(0, Date.now() - queuedAt));
  }
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  try {
    let running: Awaited<ReturnType<typeof updateMealAnalysis>>;
    try {
      running = await updateMealAnalysis(candidate.user_id, candidate.id, {
        status: "running",
        attempts: Number(candidate.attempts ?? 0) + 1,
        heartbeat_at: new Date().toISOString(),
        lease_token: leaseToken,
        error: null,
        error_code: null,
        completed_at: null,
      }, "queued");
    } catch {
      return { processed: false as const, analysis: null };
    }
    let heartbeatInFlight = false;
    heartbeat = setInterval(() => {
      if (heartbeatInFlight) return;
      heartbeatInFlight = true;
      Promise.all([
        refreshCloudflareLockWithToken(lockKey, candidate.user_id, leaseToken, ANALYSIS_LEASE_TTL_MS),
        touchMealAnalysis(candidate.user_id, candidate.id, leaseToken),
      ]).catch((error) => {
        logMeal("warn", "worker_heartbeat", error);
      }).finally(() => { heartbeatInFlight = false; });
    }, ANALYSIS_HEARTBEAT_MS);

    const meal = await findMeal(candidate.user_id, candidate.meal_id);
    if (!meal) throw new MealServiceError("not_found", "Meal not found.");
    const sourcePhotoIds = Array.isArray(candidate.source_photo_ids)
      ? candidate.source_photo_ids.filter((id): id is string => typeof id === "string")
      : [];
    const availablePhotos = meal.photos.filter((photo) => sourcePhotoIds.includes(photo.id) && (photo.storageStatus ?? "available") === "available");
    if (availablePhotos.length !== sourcePhotoIds.length) throw new MealServiceError("unavailable", "Une photo du repas n’est plus disponible.", "source_unavailable");
    const note = typeof candidate.source_note === "string" ? candidate.source_note : "";
    const [images, recipeReferences] = await Promise.all([
      Promise.all(availablePhotos.map(async (photo) => {
        const data = await timedMealStage("photo_download", () => loadMealPhotoForAnalysis(photo.objectPath));
        return { id: photo.id, mimeType: photo.mimeType, origin: photo.origin, comment: photo.comment ?? null, data };
      })),
      findRelevantMealRecipeReferences(candidate.user_id, { note, correction: candidate.source_correction ?? undefined }).catch((error) => {
        logMeal("warn", "worker_recipe_context", error);
        return [];
      }),
    ]);
    const analysed = await timedMealStage("providers", () => analyzeMealInputWithFallback({
      mealType: candidate.source_meal_type ?? meal.mealType,
      mealDate: candidate.source_meal_date ?? meal.mealDate,
      note: note || null,
      images,
      ...(candidate.error_code === "response_schema_error" && Number(candidate.attempts ?? 0) > 0
        ? { retryHint: "The previous response failed semantic validation. Check photo references, observation/value agreement, parent-child counting, nutrition ranges and allowed enums before returning JSON." }
        : {}),
      ...(candidate.source_correction ? { correction: candidate.source_correction } : {}),
      ...(candidate.source_previous_analysis ? { previousAnalysis: candidate.source_previous_analysis } : {}),
      ...(recipeReferences.length ? { recipeReferences } : {}),
    }, { requestId }));
    let canonicalResult;
    try {
      canonicalResult = await timedMealStage("validation", async () => validateMealAnalysis(analysed.result, { sourcePhotoIds }));
    } catch {
      throw new MealServiceError("unavailable", "L’analyse du repas a retourné des données incohérentes. Réessaie.", "invalid_response");
    }
    if (!await analysisSourceStillCurrent(candidate.user_id, candidate.meal_id, candidate.source_revision, candidate.source_fingerprint)) {
      throw new MealServiceError("invalid", "Les preuves du repas ont changé pendant l’analyse. Relance-la.", "source_unavailable");
    }
    const completed = await updateMealAnalysis(candidate.user_id, candidate.id, {
      status: "completed",
      provider: analysed.provider,
      model: analysed.model,
      result: canonicalResult,
      ...(analysed.provenance ? { pipeline: analysed.provenance } : {}),
      error: null,
      completed_at: new Date().toISOString(),
      heartbeat_at: null,
      lease_token: null,
      failure_started_at: null,
      retry_after_at: null,
    }, "running", leaseToken);
    return { processed: true as const, analysis: completed, previous: running };
  } catch (error) {
    const failure = workerFailure(error);
    const failedAt = candidate.failure_started_at ?? new Date().toISOString();
    const attempts = Number(candidate.attempts ?? 0) + 1;
    const retryable = isRetryableAnalysisCode(failure.code) && attempts < MAX_AUTOMATIC_ANALYSIS_RETRIES;
    const retryAfter = retryable
      ? new Date(Date.now() + (RETRY_BACKOFF_MS[Math.min(Math.max(attempts - 1, 0), RETRY_BACKOFF_MS.length - 1)] ?? RETRY_BACKOFF_MS[0])).toISOString()
      : null;
    try {
      const failed = await updateMealAnalysis(candidate.user_id, candidate.id, {
        status: "failed",
        error: failure.message,
        error_code: failure.code,
        completed_at: new Date().toISOString(),
        heartbeat_at: null,
        lease_token: null,
        failure_started_at: failedAt,
        retry_after_at: retryAfter,
      }, "running", leaseToken);
      return { processed: true as const, analysis: failed };
    } catch (persistError) {
      // A lost lease means another worker owns recovery. Do not overwrite it.
      logMeal("error", "worker_failure_persistence", persistError);
      throw new MealServiceError("unavailable", "Le résultat de l’analyse n’a pas pu être enregistré.", "storage_error");
    }
  } finally {
    if (heartbeat !== null) clearInterval(heartbeat);
    await releaseMealLease(lockKey, candidate.user_id, lease.token).catch((error) => {
      logMeal("warn", "worker_lease_release", error);
    });
  }
}

export async function analyzeMeal(userId: string, mealId: string, options: { force?: boolean; correction?: MealAnalysisCorrection; provider?: MealVisionProvider; analysisRequestId?: string } = {}) {
  assertMealId(mealId);
  const meal = await findMeal(userId, mealId);
  if (!meal) throw new MealServiceError("not_found", "Meal not found.");
  const lockKey = `meal-analysis:${userId}:${mealId}`;
  const lease = await claimMealLease(lockKey, userId, ANALYSIS_LEASE_TTL_MS);
  const claimed = lease.claimed;
  if (!claimed) throw new MealServiceError("conflict", "This meal is already being analysed.");
  try {
    const currentMeal = await findMeal(userId, mealId);
    if (!currentMeal) throw new MealServiceError("not_found", "Meal not found.");
    if (currentMeal.entryState === "skipped") throw new MealServiceError("invalid", "Réactive ce créneau avant de lancer l’analyse.");
    const note = currentMeal.note?.trim() ?? "";
    // A confirmed meal keeps photo metadata but its binaries are purged. Never
    // try to send those paths back to Grok; a new analysis can use a note or
    // newly uploaded available photos only.
    const availablePhotos = currentMeal.photos.filter((photo) => (photo.storageStatus ?? "available") === "available");
    const hasPhotos = availablePhotos.length > 0;
    const sourceFingerprint = await computeMealSourceFingerprint({ note: currentMeal.note, photos: currentMeal.photos });
    const [current, requestMatch] = await Promise.all([
      findLatestMealAnalysis(userId, mealId),
      options.analysisRequestId ? findMealAnalysisByRequestId(userId, mealId, options.analysisRequestId) : Promise.resolve(null),
    ]);
    if (requestMatch) {
      if (requestMatch.status === "completed" && requestMatch.result) return { analysis: requestMatch, fresh: false };
      if (requestMatch.status === "failed") throw new MealServiceError("unavailable", requestMatch.error ?? "L’analyse du repas a échoué. Réessaie.", requestMatch.errorCode ?? "unknown_analysis_error");
      throw new MealServiceError("conflict", "Cette analyse est déjà en cours.");
    }
    const hasCorrection = Boolean(options.correction?.trim());
    const lastSuccessful = currentMeal.lastSuccessfulAnalysis ?? (current?.status === "completed" && current.result ? current : null);
    if (!hasPhotos && !note && !hasCorrection) {
      if (lastSuccessful) return { analysis: lastSuccessful, fresh: false };
      throw new MealServiceError("invalid", "Ajoute une photo ou une courte description avant l'analyse.");
    }
    if (availablePhotos.length > MAX_MEAL_PHOTOS) throw new MealServiceError("invalid", `Un repas ne peut pas contenir plus de ${MAX_MEAL_PHOTOS} photos pour l’analyse.`);
    if (hasPhotos && !availablePhotos.every((photo) => isXaiVisionMimeType(photo.mimeType))) throw new MealServiceError("invalid", "Les photos de ce repas doivent être en JPEG ou PNG avant l’analyse.");
    if (!hasCorrection && !options.force && lastSuccessful?.sourceFingerprint === sourceFingerprint) return { analysis: lastSuccessful, fresh: false };
    if (!hasCorrection && !hasPhotos && !note && lastSuccessful) return { analysis: lastSuccessful, fresh: false };
    const sourcePhotoIds = availablePhotos.map((photo) => photo.id);
    const analysisId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await insertMealAnalysis({
      id: analysisId,
      user_id: userId,
      meal_id: mealId,
      status: "running",
      provider: options.provider?.name ?? getConfiguredMealAnalysisProvider().name,
      model: options.provider?.model ?? getConfiguredMealAnalysisProvider().model,
      analysis_request_id: options.analysisRequestId ?? null,
      source_revision: currentMeal.updatedAt,
      result: null,
      error: null,
      source_fingerprint: sourceFingerprint,
      source_photo_ids: sourcePhotoIds,
      created_at: createdAt,
      completed_at: null,
    });
    // Provider latency is intentionally unbounded. Renew the lease and the
    // persisted liveness marker while this request remains connected so a
    // slow but healthy analysis cannot be duplicated or marked stale.
    const analysisLeaseToken = lease.token;
    let heartbeatInFlight = false;
    const heartbeat = analysisLeaseToken ? setInterval(() => {
      if (heartbeatInFlight) return;
      heartbeatInFlight = true;
      Promise.all([
        refreshCloudflareLockWithToken(lockKey, userId, analysisLeaseToken, ANALYSIS_LEASE_TTL_MS),
        touchMealAnalysis(userId, analysisId),
      ]).then(([lockRefreshed]) => {
        if (!lockRefreshed) logMeal("warn", "lease_refresh");
      }).catch((error) => {
        logMeal("warn", "heartbeat", error);
      }).finally(() => {
        heartbeatInFlight = false;
      });
    }, ANALYSIS_HEARTBEAT_MS) : null;
    try {
      const [images, recipeReferences] = await Promise.all([
        Promise.all(availablePhotos.map(async (photo) => {
          const object = await getR2MealPhotoObject(photo.objectPath);
          if (!object) throw new MealServiceError("unavailable", "Une photo du repas n’est plus disponible.", "source_unavailable");
          return { id: photo.id, mimeType: photo.mimeType, origin: photo.origin, comment: photo.comment ?? null, data: await object.arrayBuffer() };
        })),
        findRelevantMealRecipeReferences(userId, { note, correction: options.correction }).catch((error) => {
          logMeal("warn", "recipe_context", error);
          return [];
        }),
      ]);
      const input = {
        mealType: currentMeal.mealType,
        mealDate: currentMeal.mealDate,
        note: note || null,
        images,
        ...(options.correction ? { correction: options.correction } : {}),
        ...(lastSuccessful?.result ? { previousAnalysis: lastSuccessful.result } : {}),
        ...(recipeReferences.length ? { recipeReferences } : {}),
      };
      const analysed = await timedMealStage("providers", () => analyzeMealInputWithFallback(input, { provider: options.provider, requestId: options.analysisRequestId }));
      let canonicalResult;
      try {
        canonicalResult = await timedMealStage("validation", async () => validateMealAnalysis(analysed.result, { sourcePhotoIds }));
      } catch {
        throw new MealServiceError("unavailable", "L’analyse du repas a retourné des données incohérentes. Réessaie.", "invalid_response");
      }
      if (!await analysisSourceStillCurrent(userId, mealId, currentMeal.updatedAt, sourceFingerprint)) {
        throw new MealServiceError("invalid", "Les preuves du repas ont changé pendant l’analyse. Relance-la.", "source_unavailable");
      }
      const completed = await updateMealAnalysis(userId, analysisId, {
        status: "completed",
        provider: analysed.provider,
        model: analysed.model,
        result: canonicalResult,
        ...(analysed.provenance ? { pipeline: analysed.provenance } : {}),
        source_fingerprint: sourceFingerprint,
        error: null,
        completed_at: new Date().toISOString(),
        failure_started_at: null,
        retry_after_at: null,
      }, "running");
      const refreshed = await findMeal(userId, mealId);
      return { analysis: refreshed?.analysis ?? completed, fresh: true };
    } catch (error) {
      const visionError = error instanceof MealVisionError ? error : null;
      const safeError = error instanceof MealServiceError ? error.message : visionError?.message ?? "L’analyse du repas a échoué. Réessaie.";
      const errorCode = error instanceof MealServiceError ? error.diagnosticCode ?? "source_unavailable" : visionError?.code ?? "unknown_analysis_error";
      const retryable = isRetryableAnalysisCode(errorCode);
      const retryAfter = retryable
        ? new Date(Date.now() + RETRY_BACKOFF_MS[0]).toISOString()
        : null;
      let failed = null;
      for (let attempt = 0; attempt < 2 && !failed; attempt += 1) {
        try {
          failed = await updateMealAnalysis(userId, analysisId, { status: "failed", error: safeError, error_code: errorCode, source_fingerprint: sourceFingerprint, failure_started_at: new Date().toISOString(), retry_after_at: retryAfter, completed_at: new Date().toISOString() }, "running");
        } catch (persistError) {
          logMeal("error", "failure_persistence", persistError);
        }
      }
      if (error instanceof MealServiceError) throw error;
      throw new MealServiceError("unavailable", failed?.error ?? safeError, errorCode);
    } finally {
      if (heartbeat !== null) clearInterval(heartbeat);
    }
  } finally {
    try {
      await releaseMealLease(lockKey, userId, lease.token);
    } catch (error) {
      logMeal("error", "lock_release", error);
    }
  }
}
