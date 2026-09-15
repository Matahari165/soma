import "server-only";

import {
  MAX_MEAL_PHOTO_BYTES,
  MAX_MEAL_PHOTOS,
  MAX_MEAL_PHOTOS_BYTES,
  normalizeMealFeeling,
  validateMealAnalysis,
  type CreateMealInput,
  type Meal,
  type MealAnalysis,
  type MealAnalysisCorrection,
  type MealFeeling,
  type MealOrigin,
  type MealPhotoMime,
  type UpdateMealInput,
} from "@/domain/meals";
import type { ConfirmedMealRecord, NutritionEstimate } from "@/domain/lab/meals";
import { isXaiVisionMimeType, MealVisionError, type MealVisionProvider } from "@/integrations/xai/meal-vision";
import { analyzeMealInputWithFallback, getConfiguredMealAnalysisProvider } from "@/integrations/meal-analysis/provider-chain";
import * as cloudflareDb from "@/lib/cloudflare/db";
import { deleteR2MealPhotoObject, getR2MealPhotoObject, mealPhotoObjectPath, putR2MealPhotoObject } from "@/lib/r2";
import { findRelevantMealRecipeReferences } from "@/services/meal-recipes";
import {
  deleteMeal,
  deletePhoto,
  findLatestMealAnalysis,
  findMealAnalysisByRequestId,
  findActiveMealAnalysis,
  findMeal,
  findMealByIdempotencyKey,
  findMealForSlot,
  findMealPhoto,
  findPhotosByUploadIdempotencyKey,
  insertMeal,
  insertMealAnalysis,
  insertPhoto,
  listMealPhotos,
  listQueuedMealAnalyses,
  listFailedMealAnalyses,
  listMealPhotoRowsForReconciliation,
  listMeals,
  updateMeal,
  updateMealAnalysis,
  updatePhotoOrigin,
  updatePhotoStorage,
  touchMealAnalysis,
  upsertMealFeelings,
  type AnalysisRow,
} from "@/repositories/meals";

const { claimCloudflareLock, claimCloudflareLockWithToken, refreshCloudflareLockWithToken, releaseCloudflareLock, releaseCloudflareLockWithToken } = cloudflareDb;

export class MealServiceError extends Error {
  constructor(readonly code: "not_found" | "invalid" | "conflict" | "unavailable", message: string, readonly diagnosticCode?: "provider_auth" | "provider_rate_limited" | "provider_request" | "provider_timeout" | "provider_unavailable" | "provider_empty_response" | "response_parse_error" | "response_schema_error" | "invalid_response" | "source_unavailable" | "storage_error" | "unknown_analysis_error" | "photo_purge_pending") {
    super(message);
    this.name = "MealServiceError";
  }
}

const PHOTO_PURGE_ERROR = "Les photos du repas n’ont pas pu être purgées. Réessaie pour terminer la confirmation.";
const ANALYSIS_LEASE_TTL_MS = 120_000;
const ANALYSIS_HEARTBEAT_MS = 30_000;
const FAILED_ANALYSIS_PHOTO_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_AUTOMATIC_ANALYSIS_RETRIES = 3;
const RETRY_BACKOFF_MS = [2 * 60_000, 10 * 60_000, 60 * 60_000] as const;

const RETRYABLE_ANALYSIS_CODES = new Set([
  "provider_rate_limited",
  "provider_request",
  "provider_timeout",
  "provider_unavailable",
  "provider_empty_response",
  "response_parse_error",
  "response_schema_error",
  "storage_error",
  "unknown_analysis_error",
]);

async function timedMealStage<T>(stage: string, context: { mealId?: string; requestId?: string }, operation: () => Promise<T>) {
  const startedAt = Date.now();
  try {
    return await operation();
  } finally {
    console.info("[meal-analysis] stage", { ...context, stage, durationMs: Date.now() - startedAt });
  }
}

type ConfirmedMealFoodWithSugar = NonNullable<ConfirmedMealRecord["foods"]>[number] & {
  sugarG?: NutritionEstimate | null;
  addedSugarG?: NutritionEstimate | null;
};

async function claimMealLease(lockKey: string, userId: string, ttlMs: number) {
  if (typeof claimCloudflareLockWithToken === "function") {
    const token = await claimCloudflareLockWithToken(lockKey, userId, ttlMs);
    // Older test/runtime adapters may expose the original boolean lock only.
    // The production token implementation returns null on contention, never
    // undefined, so undefined is a safe compatibility signal here.
    if (token !== undefined) return { claimed: Boolean(token), token };
  }
  return { claimed: await claimCloudflareLock(lockKey, userId, ttlMs), token: null };
}

async function releaseMealLease(lockKey: string, userId: string, token: string | null) {
  if (token && typeof releaseCloudflareLockWithToken === "function") return releaseCloudflareLockWithToken(lockKey, userId, token);
  return releaseCloudflareLock(lockKey, userId);
}

function photoPurgeError() {
  return new MealServiceError("unavailable", PHOTO_PURGE_ERROR, "photo_purge_pending");
}

async function setPhotoStorageState(userId: string, mealId: string, photoId: string, storageStatus: "available" | "purge_pending" | "purged", purgedAt: string | null) {
  try {
    const updated = await updatePhotoStorage(userId, mealId, photoId, { storageStatus, purgedAt });
    if (!updated) throw photoPurgeError();
  } catch (error) {
    console.error("[meal-analysis] photo storage state update failed", { mealId, photoId, storageStatus, stage: "photo_storage", reason: error instanceof Error ? error.name : "unknown" });
    throw photoPurgeError();
  }
}

function hasPreservedAnalysis(meal: Meal, confirmedAnalysis: UpdateMealInput["confirmedAnalysis"]) {
  if (meal.analysis?.status === "queued" || meal.analysis?.status === "running") return Boolean(confirmedAnalysis);
  return Boolean(
    confirmedAnalysis
      ?? (meal.analysis?.status === "completed" && meal.analysis.result ? meal.analysis.result : null)
      ?? (meal.lastSuccessfulAnalysis?.status === "completed" && meal.lastSuccessfulAnalysis.result ? meal.lastSuccessfulAnalysis.result : null),
  );
}

function analysisUsedForConfirmation(meal: Meal) {
  if (meal.analysis?.status === "queued" || meal.analysis?.status === "running") return null;
  if (meal.analysis?.status === "completed" && meal.analysis.result) return meal.analysis;
  if (meal.lastSuccessfulAnalysis?.status === "completed" && meal.lastSuccessfulAnalysis.result) return meal.lastSuccessfulAnalysis;
  return null;
}

/**
 * Hashes only the current analysis evidence. The note and photo metadata never
 * leave this process and are not written to logs or diagnostics.
 */
export async function computeMealSourceFingerprint(meal: Pick<Meal, "note" | "photos">) {
  const photos = meal.photos
    .filter((photo) => (photo.storageStatus ?? "available") === "available")
    .map((photo) => ({ id: photo.id, origin: photo.origin, status: photo.storageStatus ?? "available" }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const payload = JSON.stringify({ version: 1, note: meal.note?.trim() ?? "", photos });
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function purgeMealPhoto(userId: string, mealId: string, photo: Meal["photos"][number]) {
  // D1 is marked first so an R2 failure leaves an explicit retry state. If
  // this write fails, the binary is deliberately kept and the error is
  // surfaced to the caller.
  await setPhotoStorageState(userId, mealId, photo.id, "purge_pending", null);
  try {
    await deleteR2MealPhotoObject(photo.objectPath);
    await setPhotoStorageState(userId, mealId, photo.id, "purged", new Date().toISOString());
  } catch (error) {
    // The successful pending write remains the durable recovery marker. The
    // binary may or may not have been removed when the final D1 write failed,
    // so retries must reconcile from this state rather than guess.
    console.error("[meal-analysis] photo purge did not finish", { mealId, photoId: photo.id, stage: "photo_purge", reason: error instanceof Error ? error.name : "unknown" });
    throw photoPurgeError();
  }
}

function isRetryableAnalysisCode(value: unknown) {
  return typeof value === "string" && RETRYABLE_ANALYSIS_CODES.has(value);
}

function rowPhotoIds(row: AnalysisRow) {
  return Array.isArray(row.source_photo_ids)
    ? row.source_photo_ids.filter((id): id is string => typeof id === "string")
    : [];
}

/**
 * Common completion boundary for every analysis path. The meal becomes
 * scoreable as soon as the validated result is persisted; photo deletion is
 * best-effort and leaves a durable purge_pending marker for the cron retry.
 */
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
    console.warn("[meal-analysis] source changed before finalization", { mealId, stage: "finalize_source_changed" });
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
        console.warn("[meal-analysis] stale result could not be retired", { mealId, analysisId: analysis.id, stage: "finalize_source_changed_retire", reason: error instanceof Error ? error.name : "unknown" });
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
      await timedMealStage("photo_purge", { mealId }, () => purgeMealPhoto(userId, mealId, photo));
    } catch (error) {
      // Confirmation must never depend on the availability of R2. The pending
      // D1 state is enough for the scheduled reconciler to retry safely.
      console.warn("[meal-analysis] photo purge deferred", { mealId, photoId: photo.id, stage: "photo_purge_deferred", reason: error instanceof Error ? error.name : "unknown" });
    }
  }));
  return findMeal(userId, mealId);
}

/** Reconcile pending purges and legacy confirmed photos on every cron tick. */
export async function reconcileMealPhotoPurges(limit = 100) {
  const rows = await listMealPhotoRowsForReconciliation(limit);
  let attempted = 0;
  let purged = 0;
  for (const row of rows) {
    const status = row.storage_status === "purged" ? "purged" : row.storage_status === "purge_pending" ? "purge_pending" : "available";
    if (status === "purged") continue;
    const meal = await findMeal(String(row.user_id), String(row.meal_id)).catch(() => null);
    if (!meal || (status === "available" && meal.status !== "confirmed")) continue;
    const photo = meal.photos.find((candidate) => candidate.id === row.id);
    if (!photo) continue;
    attempted += 1;
    try {
      await timedMealStage("photo_purge_retry", { mealId: meal.id }, () => purgeMealPhoto(String(row.user_id), String(row.meal_id), photo));
      purged += 1;
    } catch (error) {
      console.warn("[meal-analysis] photo purge retry deferred", { mealId: meal.id, photoId: photo.id, stage: "photo_purge_retry_deferred", reason: error instanceof Error ? error.name : "unknown" });
    }
  }
  return { attempted, purged };
}

/** Requeue transient failures while their source photos are still available. */
export async function requeueRetryableMealAnalyses(now = Date.now()) {
  const rows = await listFailedMealAnalyses(100);
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
        error_code: null,
        heartbeat_at: null,
        lease_token: null,
        completed_at: null,
        retry_after_at: null,
      }, "failed");
      requeued += 1;
    } catch (error) {
      console.warn("[meal-analysis] failed analysis could not be requeued", { analysisId: row.id, stage: "retry_requeue", reason: error instanceof Error ? error.name : "unknown" });
    }
  }
  return requeued;
}

/** Purge evidence for failures that have exceeded the 24-hour retention window. */
export async function purgeExpiredFailedAnalysisPhotos(now = Date.now()) {
  const rows = await listFailedMealAnalyses(100);
  let purged = 0;
  for (const row of rows) {
    const failedAt = Date.parse(String(row.failure_started_at ?? row.completed_at ?? row.updated_at ?? row.created_at));
    if (!Number.isFinite(failedAt) || now - failedAt < FAILED_ANALYSIS_PHOTO_TTL_MS) continue;
    const userId = String(row.user_id);
    const meal = await findMeal(userId, String(row.meal_id)).catch(() => null);
    if (!meal) continue;
    const sourceIds = new Set(rowPhotoIds(row));
    for (const photo of meal.photos.filter((candidate) => (candidate.storageStatus ?? "available") !== "purged" && (sourceIds.size === 0 || sourceIds.has(candidate.id)))) {
      try {
        await timedMealStage("photo_purge_failed_ttl", { mealId: meal.id }, () => purgeMealPhoto(userId, meal.id, photo));
        purged += 1;
      } catch (error) {
        console.warn("[meal-analysis] expired failed photo purge deferred", { mealId: meal.id, photoId: photo.id, stage: "photo_purge_failed_ttl_deferred", reason: error instanceof Error ? error.name : "unknown" });
      }
    }
  }
  return purged;
}

function assertMealId(id: string) {
  if (!/^[0-9a-f-]{20,80}$/i.test(id)) throw new MealServiceError("invalid", "The meal id is invalid.");
}

function assertPhotoSize(size: number) {
  if (size <= 0 || size > MAX_MEAL_PHOTO_BYTES) throw new MealServiceError("invalid", "Each photo must be between 1 byte and 12 MB.");
}

export async function createMeal(userId: string, input: CreateMealInput) {
  // Photos are uploaded through the separate multipart endpoint; a confirmed
  // create can therefore only be valid for a text-only meal.
  if (input.status === "confirmed" && !input.note?.trim()) throw new MealServiceError("invalid", "Ajoute une photo ou une courte description avant de confirmer.");
  const idempotencyLock = input.idempotencyKey ? `meal-create:${userId}:${input.idempotencyKey}` : null;
  let lockClaimed = false;
  if (idempotencyLock) {
    lockClaimed = await claimCloudflareLock(idempotencyLock, userId, 30_000);
    if (!lockClaimed) {
      const concurrentId = await findMealByIdempotencyKey(userId, input.idempotencyKey as string);
      if (concurrentId) {
        const concurrentMeal = await findMeal(userId, concurrentId);
        if (concurrentMeal) return { meal: concurrentMeal, created: false };
      }
      throw new MealServiceError("conflict", "This meal is already being created.");
    }
  }
  try {
  const slotMeal = await findMealForSlot(userId, input.mealDate, input.mealType);
  if (slotMeal) {
    const existing = await findMeal(userId, slotMeal.id);
    if (existing) return { meal: existing, created: false };
  }
  if (input.idempotencyKey) {
    const existingId = await findMealByIdempotencyKey(userId, input.idempotencyKey);
    if (existingId) {
      const existing = await findMeal(userId, existingId);
      if (existing) return { meal: existing, created: false };
    }
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const row = await insertMeal({
    id,
    user_id: userId,
    meal_date: input.mealDate,
    meal_type: input.mealType,
    note: input.note ?? null,
    status: input.status ?? "draft",
    idempotency_key: input.idempotencyKey ?? null,
    mouth_warmth_intensity: normalizeMealFeeling(input.mouthWarmthIntensity),
    stomach_overfull_intensity: normalizeMealFeeling(input.stomachOverfullIntensity),
    created_at: now,
    updated_at: now,
  });
  const persisted = await findMealForSlot(userId, input.mealDate, input.mealType);
  if (!persisted) throw new MealServiceError("unavailable", "The meal was saved but could not be located.");
  if (persisted.id !== row.id) {
    const concurrentMeal = await findMeal(userId, persisted.id);
    if (concurrentMeal) return { meal: concurrentMeal, created: false };
    throw new MealServiceError("unavailable", "The meal slot was saved but could not be reloaded.");
  }
  const hasFeelings = input.mouthWarmthIntensity !== undefined || input.stomachOverfullIntensity !== undefined;
  if (hasFeelings) {
    await upsertMealFeelings(userId, id, {
      mouthWarmthIntensity: normalizeMealFeeling(input.mouthWarmthIntensity),
      stomachOverfullIntensity: normalizeMealFeeling(input.stomachOverfullIntensity),
    });
  }
  const meal = await findMeal(userId, row.id);
  if (!meal) throw new MealServiceError("unavailable", "The meal was saved but could not be reloaded.");
  return { meal, created: true };
  } finally {
    if (idempotencyLock && lockClaimed) {
      try {
        await releaseCloudflareLock(idempotencyLock, userId);
      } catch (error) {
        console.error("[meal-analysis] meal creation lock release failed", { stage: "meal_create_lock_release", reason: error instanceof Error ? error.name : "unknown" });
      }
    }
  }
}

export async function updateMealRecord(userId: string, mealId: string, input: UpdateMealInput) {
  assertMealId(mealId);
  const current = await findMeal(userId, mealId);
  if (!current) throw new MealServiceError("not_found", "Meal not found.");
  let confirmedAnalysis = input.confirmedAnalysis;
  if (confirmedAnalysis) {
    try {
      confirmedAnalysis = validateMealAnalysis(confirmedAnalysis);
    } catch {
      throw new MealServiceError("invalid", "La correction nutritionnelle est incohérente. Relance l’analyse puis réessaie.", "invalid_response");
    }
  }
  const activePhotos = current.photos.filter((photo) => (photo.storageStatus ?? "available") === "available");
  if (confirmedAnalysis && input.status !== "confirmed") throw new MealServiceError("invalid", "An edited analysis is saved when the meal is confirmed.");
  const effectiveNote = input.note !== undefined ? input.note : current.note;
  if (input.status === "confirmed") {
    if (activePhotos.length === 0 && !effectiveNote?.trim()) {
      // A previously confirmed textless meal may have had its binaries purged.
      // It remains confirmable because it is no longer reanalysable from the
      // original photos.
      if (current.status !== "confirmed") throw new MealServiceError("invalid", "Ajoute une photo ou une courte description avant de confirmer.");
    }
    if (activePhotos.length > 0 && !hasPreservedAnalysis(current, confirmedAnalysis)) {
      throw new MealServiceError("invalid", "Analyse les photos avant de confirmer ce repas.");
    }
    const hasCurrentEvidence = activePhotos.length > 0 || Boolean(effectiveNote?.trim());
    if (hasCurrentEvidence && !confirmedAnalysis) {
      const analysis = analysisUsedForConfirmation(current);
      if (analysis) {
        const currentFingerprint = await computeMealSourceFingerprint({ note: effectiveNote ?? null, photos: current.photos });
        if (analysis.sourceFingerprint && analysis.sourceFingerprint !== currentFingerprint) {
          throw new MealServiceError("invalid", "Les preuves du repas ont changé. Relance l’analyse avant de confirmer ce repas.");
        }
      }
    }
    // Les ressentis restent optionnels et ne bloquent pas la confirmation.
  }
  if ((input.mealDate && input.mealDate !== current.mealDate) || (input.mealType && input.mealType !== current.mealType)) {
    const conflicting = await findMealForSlot(userId, input.mealDate ?? current.mealDate, input.mealType ?? current.mealType);
    if (conflicting && conflicting.id !== mealId) throw new MealServiceError("conflict", "That meal slot is already recorded.");
  }
  const values: Record<string, unknown> = {};
  if (input.mealDate !== undefined) values.meal_date = input.mealDate;
  if (input.mealType !== undefined) values.meal_type = input.mealType;
  if (input.note !== undefined) values.note = input.note;
  if (input.status !== undefined) values.status = input.status;
  const feelingValues: { mouthWarmthIntensity?: MealFeeling; stomachOverfullIntensity?: MealFeeling } = {};
  if (input.mouthWarmthIntensity !== undefined) feelingValues.mouthWarmthIntensity = normalizeMealFeeling(input.mouthWarmthIntensity);
  if (input.stomachOverfullIntensity !== undefined) feelingValues.stomachOverfullIntensity = normalizeMealFeeling(input.stomachOverfullIntensity);
  if (Object.keys(values).length) await updateMeal(userId, mealId, values);
  if (Object.keys(feelingValues).length) {
    await upsertMealFeelings(userId, mealId, {
      mouthWarmthIntensity: input.mouthWarmthIntensity !== undefined ? feelingValues.mouthWarmthIntensity : current.mouthWarmthIntensity,
      stomachOverfullIntensity: input.stomachOverfullIntensity !== undefined ? feelingValues.stomachOverfullIntensity : current.stomachOverfullIntensity,
    });
  }
  let persistedAnalysis: Awaited<ReturnType<typeof insertMealAnalysis>> | null = null;
  if (confirmedAnalysis) {
    const sourceFingerprint = await computeMealSourceFingerprint({ note: effectiveNote ?? null, photos: current.photos });
    persistedAnalysis = await insertMealAnalysis({
      id: crypto.randomUUID(),
      user_id: userId,
      meal_id: mealId,
      status: "completed",
      provider: "user",
      model: "confirmed-v1",
      result: confirmedAnalysis,
      error: null,
      source_fingerprint: sourceFingerprint,
      source_photo_ids: activePhotos.map((photo) => photo.id),
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });
  }
  if (input.status === "confirmed" && activePhotos.length > 0) {
    // A confirmation manuelle/legacy follows the same idempotent finalizer as
    // the automatic worker. R2 failures are recorded as purge_pending and do
    // not roll back the confirmed meal.
    const analysisForFinalization = persistedAnalysis ?? analysisUsedForConfirmation(current);
    if (analysisForFinalization) await finalizeMealAnalysis(userId, mealId, analysisForFinalization);
  }
  const updated = await findMeal(userId, mealId);
  if (!updated) throw new MealServiceError("unavailable", "The meal was updated but could not be reloaded.");
  return updated;
}

export async function addMealPhotos(userId: string, mealId: string, files: Array<{ id?: string; filename?: string | null; mimeType: MealPhotoMime; size: number; data: ArrayBuffer; origin: MealOrigin }>, options: { idempotencyKey?: string } = {}) {
  assertMealId(mealId);
  if (!await findMeal(userId, mealId)) throw new MealServiceError("not_found", "Meal not found.");
  if (files.length < 1) throw new MealServiceError("invalid", "Add at least one photo.");
  if (files.length > MAX_MEAL_PHOTOS) throw new MealServiceError("invalid", `A meal can contain at most ${MAX_MEAL_PHOTOS} photos.`);
  if (files.some((file) => !isXaiVisionMimeType(file.mimeType))) throw new MealServiceError("invalid", "Les photos doivent être en JPEG ou PNG avant l’analyse.");
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > MAX_MEAL_PHOTOS_BYTES) throw new MealServiceError("invalid", "The selected photos are too large together.");
  files.forEach((file) => assertPhotoSize(file.size));

  // Serialize every upload for a meal, not only retries with the same key.
  // Otherwise two requests can both observe four photos and each pass the
  // six-photo check before either request writes its metadata.
  const uploadLock = `meal-photos:${userId}:${mealId}`;
  const lease = await claimMealLease(uploadLock, userId, 90_000);
  const claimed = lease.claimed;
  if (!claimed) {
    if (options.idempotencyKey) {
      const existing = await findPhotosByUploadIdempotencyKey(userId, mealId, options.idempotencyKey);
      if (existing.length) return existing;
    }
    throw new MealServiceError("conflict", "This photo upload is already being processed.");
  }
  try {
    if (options.idempotencyKey) {
      const existing = await findPhotosByUploadIdempotencyKey(userId, mealId, options.idempotencyKey);
      if (existing.length) return existing;
    }
    const meal = await findMeal(userId, mealId);
    if (!meal) throw new MealServiceError("not_found", "Meal not found.");
    const storedPhotoCount = meal.photos.filter((photo) => (photo.storageStatus ?? "available") === "available").length;
    if (storedPhotoCount + files.length > MAX_MEAL_PHOTOS) throw new MealServiceError("invalid", `A meal can contain at most ${MAX_MEAL_PHOTOS} photos.`);

    const stored: string[] = [];
    const insertedIds: string[] = [];
    try {
      const photos = [];
      for (let index = 0; index < files.length; index += 2) {
        const batch = files.slice(index, index + 2);
        const uploaded = await Promise.all(batch.map(async (file) => {
          const id = file.id ?? crypto.randomUUID();
          const objectPath = mealPhotoObjectPath(userId, mealId, id, file.mimeType);
          await timedMealStage("photo_upload", { mealId }, () => putR2MealPhotoObject(objectPath, file.data, file.mimeType));
          stored.push(objectPath);
          insertedIds.push(id);
          return insertPhoto({
            id,
            user_id: userId,
            meal_id: mealId,
            origin: file.origin,
            object_path: objectPath,
            mime_type: file.mimeType,
            bytes: file.size,
            created_at: new Date().toISOString(),
            upload_idempotency_key: options.idempotencyKey ?? null,
            filename: file.filename ?? null,
            storage_status: "available",
            purged_at: null,
          });
        }));
        photos.push(...await Promise.all(uploaded));
      }
      if (meal.status === "confirmed") await updateMeal(userId, mealId, { status: "draft" });
      return photos;
    } catch (error) {
      // Metadata and R2 are kept together as far as possible. A failed D1 write
      // must not leave an inaccessible private photo behind.
      await Promise.all(stored.map((path) => deleteR2MealPhotoObject(path).catch((cleanupError) => {
        console.error("[meal-analysis] orphaned photo cleanup failed", { mealId, stage: "photo_r2_cleanup", reason: cleanupError instanceof Error ? cleanupError.name : "unknown" });
      })));
      await Promise.all(insertedIds.map((id) => deletePhoto(userId, mealId, id).catch((cleanupError) => {
        console.error("[meal-analysis] photo metadata cleanup failed", { mealId, photoId: id, stage: "photo_d1_cleanup", reason: cleanupError instanceof Error ? cleanupError.name : "unknown" });
      })));
      if (error instanceof MealServiceError) throw error;
      throw new MealServiceError("unavailable", "The meal photos could not be saved.");
    }
  } finally {
    await releaseMealLease(uploadLock, userId, lease.token).catch((error) => console.error("[meal-analysis] photo lock release failed", { mealId, stage: "photo_lock_release", reason: error instanceof Error ? error.name : "unknown" }));
  }
}

export async function updateMealPhotoOrigins(userId: string, mealId: string, origins: Array<{ photoId: string; origin: MealOrigin }>) {
  for (const item of origins) await updatePhotoOrigin(userId, mealId, item.photoId, item.origin);
}

export async function updateMealPhotoOrigin(userId: string, mealId: string, photoId: string, origin: MealOrigin) {
  assertMealId(mealId);
  if (!/^[0-9a-f-]{20,80}$/i.test(photoId)) throw new MealServiceError("invalid", "The photo id is invalid.");
  const updated = await updatePhotoOrigin(userId, mealId, photoId, origin);
  if (!updated) throw new MealServiceError("not_found", "Photo not found.");
  await updateMeal(userId, mealId, { status: "draft" });
  return updated;
}

export async function removeMealPhoto(userId: string, mealId: string, photoId: string) {
  assertMealId(mealId);
  if (!/^[0-9a-f-]{20,80}$/i.test(photoId)) throw new MealServiceError("invalid", "The photo id is invalid.");
  const meal = await findMeal(userId, mealId);
  if (!meal) throw new MealServiceError("not_found", "Meal not found.");
  const removed = await deletePhoto(userId, mealId, photoId);
  if (!removed) throw new MealServiceError("not_found", "Photo not found.");
  await updateMeal(userId, mealId, { status: "draft" });
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
      console.warn("[meal-analysis] enqueue lease release failed", { requestId: options.analysisRequestId, stage: "enqueue_lease_release", reason: error instanceof Error ? error.name : "unknown" });
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
  if (!availablePhotos.length && !note) {
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
  if (!options.force && lastSuccessful?.sourceFingerprint === sourceFingerprint) return { analysis: lastSuccessful, fresh: false, queued: false };

  const configured = options.provider ?? getConfiguredMealAnalysisProvider();
  const row: AnalysisRow = {
    id: crypto.randomUUID(),
    user_id: userId,
    meal_id: mealId,
    status: "queued",
    provider: configured.name,
    model: configured.model,
    analysis_request_id: options.analysisRequestId ?? null,
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
    console.error("[meal-analysis] durable enqueue failed", { requestId: options.analysisRequestId, stage: "enqueue", reason: error instanceof Error ? error.name : "unknown" });
    throw new MealServiceError("unavailable", "L’analyse du repas n’a pas pu être mise en file.", "storage_error");
  }
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
export async function processNextMealAnalysis() {
  await requeueRetryableMealAnalyses().catch((error) => {
    console.warn("[meal-analysis] automatic retry scan failed", { stage: "retry_scan", reason: error instanceof Error ? error.name : "unknown" });
  });
  const candidates = await listQueuedMealAnalyses(1);
  const candidate = candidates[0];
  if (!candidate) return { processed: false as const, analysis: null };
  const lockKey = `meal-analysis-job:${candidate.id}`;
  const lease = await claimMealLease(lockKey, candidate.user_id, ANALYSIS_LEASE_TTL_MS);
  if (!lease.claimed) return { processed: false as const, analysis: null };
  const leaseToken = lease.token ?? crypto.randomUUID();
  const requestId = typeof candidate.analysis_request_id === "string" ? candidate.analysis_request_id : undefined;
  const queuedAt = Date.parse(String(candidate.created_at));
  if (Number.isFinite(queuedAt)) {
    console.info("[meal-analysis] stage", { mealId: candidate.meal_id, requestId, stage: "queue_wait", durationMs: Math.max(0, Date.now() - queuedAt) });
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
        console.warn("[meal-analysis] worker heartbeat failed", { requestId, stage: "worker_heartbeat", reason: error instanceof Error ? error.name : "unknown" });
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
        const object = await timedMealStage("photo_download", { mealId: candidate.meal_id, requestId }, () => getR2MealPhotoObject(photo.objectPath));
        if (!object) throw new MealServiceError("unavailable", "Une photo du repas n’est plus disponible.", "source_unavailable");
        return { id: photo.id, mimeType: photo.mimeType, origin: photo.origin, data: await object.arrayBuffer() };
      })),
      findRelevantMealRecipeReferences(candidate.user_id, { note, correction: candidate.source_correction ?? undefined }).catch((error) => {
        console.warn("[meal-analysis] recipe context unavailable; continuing without it", { requestId, stage: "worker_recipe_context", reason: error instanceof Error ? error.name : "unknown" });
        return [];
      }),
    ]);
    const analysed = await timedMealStage("providers", { mealId: candidate.meal_id, requestId }, () => analyzeMealInputWithFallback({
      mealType: candidate.source_meal_type ?? meal.mealType,
      mealDate: candidate.source_meal_date ?? meal.mealDate,
      note: note || null,
      images,
      ...(candidate.source_correction ? { correction: candidate.source_correction } : {}),
      ...(candidate.source_previous_analysis ? { previousAnalysis: candidate.source_previous_analysis } : {}),
      ...(recipeReferences.length ? { recipeReferences } : {}),
    }, { requestId }));
    let canonicalResult;
    try {
      canonicalResult = await timedMealStage("validation", { mealId: candidate.meal_id, requestId }, async () => validateMealAnalysis(analysed.result, { sourcePhotoIds }));
    } catch {
      throw new MealServiceError("unavailable", "L’analyse du repas a retourné des données incohérentes. Réessaie.", "invalid_response");
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
    await finalizeMealAnalysis(candidate.user_id, candidate.meal_id, completed);
    return { processed: true as const, analysis: completed, previous: running };
  } catch (error) {
    const failure = workerFailure(error);
    const failedAt = candidate.failure_started_at ?? new Date().toISOString();
    const attempts = Number(candidate.attempts ?? 0);
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
      console.error("[meal-analysis] worker result could not be persisted", { requestId, stage: "worker_failure_persistence", reason: persistError instanceof Error ? persistError.name : "unknown" });
      throw new MealServiceError("unavailable", "Le résultat de l’analyse n’a pas pu être enregistré.", "storage_error");
    }
  } finally {
    if (heartbeat !== null) clearInterval(heartbeat);
    await releaseMealLease(lockKey, candidate.user_id, lease.token).catch((error) => {
      console.warn("[meal-analysis] worker lease release failed", { requestId, stage: "worker_lease_release", reason: error instanceof Error ? error.name : "unknown" });
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
    const lastSuccessful = currentMeal.lastSuccessfulAnalysis ?? (current?.status === "completed" && current.result ? current : null);
    if (!hasPhotos && !note) {
      if (lastSuccessful) return { analysis: lastSuccessful, fresh: false };
      throw new MealServiceError("invalid", "Ajoute une photo ou une courte description avant l'analyse.");
    }
    if (availablePhotos.length > MAX_MEAL_PHOTOS) throw new MealServiceError("invalid", `Un repas ne peut pas contenir plus de ${MAX_MEAL_PHOTOS} photos pour l’analyse.`);
    if (hasPhotos && !availablePhotos.every((photo) => isXaiVisionMimeType(photo.mimeType))) throw new MealServiceError("invalid", "Les photos de ce repas doivent être en JPEG ou PNG avant l’analyse.");
    if (!options.force && lastSuccessful?.sourceFingerprint === sourceFingerprint) return { analysis: lastSuccessful, fresh: false };
    if (!hasPhotos && !note && lastSuccessful) return { analysis: lastSuccessful, fresh: false };
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
        if (!lockRefreshed) console.warn("[meal-analysis] analysis lease was lost", { requestId: options.analysisRequestId, mealId, stage: "lease_refresh" });
      }).catch((error) => {
        console.warn("[meal-analysis] analysis heartbeat failed", { requestId: options.analysisRequestId, mealId, stage: "heartbeat", reason: error instanceof Error ? error.name : "unknown" });
      }).finally(() => {
        heartbeatInFlight = false;
      });
    }, ANALYSIS_HEARTBEAT_MS) : null;
    try {
      const [images, recipeReferences] = await Promise.all([
        Promise.all(availablePhotos.map(async (photo) => {
          const object = await getR2MealPhotoObject(photo.objectPath);
          if (!object) throw new MealServiceError("unavailable", "Une photo du repas n’est plus disponible.", "source_unavailable");
          return { id: photo.id, mimeType: photo.mimeType, origin: photo.origin, data: await object.arrayBuffer() };
        })),
        findRelevantMealRecipeReferences(userId, { note, correction: options.correction }).catch((error) => {
          console.warn("[meal-analysis] recipe context unavailable; continuing without it", { requestId: options.analysisRequestId, mealId, stage: "recipe_context", reason: error instanceof Error ? error.name : "unknown" });
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
      const analysed = await timedMealStage("providers", { mealId, requestId: options.analysisRequestId }, () => analyzeMealInputWithFallback(input, { provider: options.provider, requestId: options.analysisRequestId }));
      let canonicalResult;
      try {
        canonicalResult = await timedMealStage("validation", { mealId, requestId: options.analysisRequestId }, async () => validateMealAnalysis(analysed.result, { sourcePhotoIds }));
      } catch {
        throw new MealServiceError("unavailable", "L’analyse du repas a retourné des données incohérentes. Réessaie.", "invalid_response");
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
      await finalizeMealAnalysis(userId, mealId, completed);
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
          console.error("[meal-analysis] failed analysis could not be persisted", {
            requestId: options.analysisRequestId,
            mealId,
            analysisId,
            stage: "failure_persistence",
            reason: persistError instanceof Error ? persistError.name : "unknown",
          });
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
      console.error("[meal-analysis] analysis lock release failed", {
        requestId: options.analysisRequestId,
        mealId,
        stage: "lock_release",
        reason: error instanceof Error ? error.name : "unknown",
      });
    }
  }
}

function nutritionEstimate(value: { low: number; likely: number; high: number } | null | undefined): NutritionEstimate | null {
  if (!value || !Number.isFinite(value.low) || !Number.isFinite(value.likely) || !Number.isFinite(value.high) || value.low < 0 || value.low > value.likely || value.likely > value.high) return null;
  return { low: value.low, likely: value.likely, high: value.high };
}

function confirmedMealFood(food: MealAnalysis["foods"][number]): ConfirmedMealFoodWithSugar {
  return {
    id: food.id,
    name: food.name,
    kind: food.kind,
    parentId: food.parentId,
    portion: food.portion ?? null,
    estimatedGrams: food.estimatedGrams ?? null,
    quantity: food.quantity ?? null,
    sugarG: nutritionEstimate(food.sugarGrams),
    addedSugarG: nutritionEstimate(food.addedSugarGrams),
    varietyKey: food.varietyKey ?? null,
    foodGroups: food.foodGroups,
    alcoholic: food.alcoholic,
    novaGroup: food.novaGroup,
    sugarExposure: food.sugarExposure,
    qualityProperties: food.qualityProperties,
    observation: food.observation,
    countedInTotals: food.countedInTotals,
    confidence: food.confidence,
  };
}

function mealOrigin(meal: Meal): ConfirmedMealRecord["origin"] {
  const origins = new Set(meal.photos.map((photo) => photo.origin));
  return origins.size === 0 ? "unknown" : origins.size === 1 ? [...origins][0] : "mixed";
}

/**
 * Adapter consumed by Personal Lab. Every confirmed meal remains an
 * observation; an unavailable analysis contributes nulls, never zeros.
 */
export async function loadConfirmedMealRecords(userId: string, options: { from?: string; to?: string } = {}): Promise<ConfirmedMealRecord[]> {
  const meals = await listMeals(userId, { ...options, preferLatestCompletedAnalysis: true });
  return meals.flatMap((meal) => {
    if (meal.status !== "confirmed") return [];
    const analysis = meal.analysis?.status === "completed" && meal.analysis.result
      ? meal.analysis
      : meal.lastSuccessfulAnalysis?.status === "completed" && meal.lastSuccessfulAnalysis.result
        ? meal.lastSuccessfulAnalysis
        : null;
    const result = analysis?.result ?? null;
    const totals = result?.totals;
    return [{
      id: meal.id,
      mealDate: meal.mealDate,
      mealType: meal.mealType,
      status: "confirmed" as const,
      entryState: meal.entryState,
      origin: mealOrigin(meal),
      caloriesKcal: nutritionEstimate(totals?.calories),
      proteinG: nutritionEstimate(totals?.proteinGrams),
      carbsG: nutritionEstimate(totals?.carbohydrateGrams),
      fatG: nutritionEstimate(totals?.fatGrams),
      fiberG: nutritionEstimate(totals?.fiberGrams),
      sugarG: nutritionEstimate(totals?.sugarGrams),
      addedSugarG: nutritionEstimate(totals?.addedSugarGrams),
      foods: result?.foods.map(confirmedMealFood),
      analysisConfidence: result?.confidence,
      mouthHeat: meal.mouthWarmthIntensity,
      stomachOverfullness: meal.stomachOverfullIntensity,
      photoIds: meal.photos.map((photo) => photo.id),
    } satisfies ConfirmedMealRecord];
  });
}

export { deleteMeal, findMeal, findMealPhoto, listMealPhotos, listMeals };
