import "server-only";

import {
  MAX_MEAL_PHOTO_BYTES,
  MAX_MEAL_PHOTOS,
  MAX_MEAL_PHOTOS_BYTES,
  normalizeMealFeeling,
  validateMealAnalysis,
  type CreateMealInput,
  type Meal,
  type MealAnalysisCorrection,
  type MealFeeling,
  type MealOrigin,
  type MealPhotoMime,
  type UpdateMealInput,
} from "@/domain/meals";
import type { ConfirmedMealRecord, NutritionEstimate } from "@/domain/lab/meals";
import { analyzeMealInput, isXaiVisionMimeType, MealVisionError, type MealVisionProvider } from "@/integrations/xai/meal-vision";
import { claimCloudflareLock, releaseCloudflareLock } from "@/lib/cloudflare/db";
import { deleteR2MealPhotoObject, getR2MealPhotoObject, mealPhotoObjectPath, putR2MealPhotoObject } from "@/lib/r2";
import {
  deleteMeal,
  deletePhoto,
  findLatestMealAnalysis,
  findMeal,
  findMealByIdempotencyKey,
  findMealForSlot,
  findMealPhoto,
  findPhotosByUploadIdempotencyKey,
  insertMeal,
  insertMealAnalysis,
  insertPhoto,
  listMealPhotos,
  listMeals,
  updateMeal,
  updateMealAnalysis,
  updatePhotoOrigin,
  updatePhotoStorage,
  upsertMealFeelings,
} from "@/repositories/meals";

export class MealServiceError extends Error {
  constructor(readonly code: "not_found" | "invalid" | "conflict" | "unavailable", message: string, readonly diagnosticCode?: "provider_auth" | "provider_rate_limited" | "provider_request" | "provider_unavailable" | "invalid_response" | "source_unavailable" | "photo_purge_pending") {
    super(message);
    this.name = "MealServiceError";
  }
}

const PHOTO_PURGE_ERROR = "Les photos du repas n’ont pas pu être purgées. Réessaie pour terminer la confirmation.";

function photoPurgeError() {
  return new MealServiceError("unavailable", PHOTO_PURGE_ERROR, "photo_purge_pending");
}

async function setPhotoStorageState(userId: string, mealId: string, photoId: string, storageStatus: "available" | "purge_pending" | "purged", purgedAt: string | null) {
  try {
    const updated = await updatePhotoStorage(userId, mealId, photoId, { storageStatus, purgedAt });
    if (!updated) throw photoPurgeError();
  } catch {
    throw photoPurgeError();
  }
}

function hasPreservedAnalysis(meal: Meal, confirmedAnalysis: UpdateMealInput["confirmedAnalysis"]) {
  if (meal.analysis?.status === "running") return Boolean(confirmedAnalysis);
  return Boolean(
    confirmedAnalysis
      ?? (meal.analysis?.status === "completed" && meal.analysis.result ? meal.analysis.result : null)
      ?? (meal.lastSuccessfulAnalysis?.status === "completed" && meal.lastSuccessfulAnalysis.result ? meal.lastSuccessfulAnalysis.result : null),
  );
}

function analysisUsedForConfirmation(meal: Meal) {
  if (meal.analysis?.status === "running") return null;
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
  } catch {
    // The successful pending write remains the durable recovery marker. The
    // binary may or may not have been removed when the final D1 write failed,
    // so retries must reconcile from this state rather than guess.
    throw photoPurgeError();
  }
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
    if (idempotencyLock && lockClaimed) await releaseCloudflareLock(idempotencyLock, userId).catch(() => undefined);
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
  const activePhotos = current.photos.filter((photo) => (photo.storageStatus ?? "available") !== "purged");
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
  if (confirmedAnalysis) {
    const sourceFingerprint = await computeMealSourceFingerprint({ note: effectiveNote ?? null, photos: current.photos });
    await insertMealAnalysis({
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
    // Politique Soma : l'analyse D1 est conservée, les binaires R2 sont
    // purgés à la confirmation. Les lignes meal_photos (origine, métadonnées)
    // sont gardées pour l'historique et Personal Lab. Un échec est exposé avec
    // un état purge_pending pour permettre une nouvelle tentative.
    await Promise.all(
      activePhotos.map((photo) => purgeMealPhoto(userId, mealId, photo)),
    );
  }
  const updated = await findMeal(userId, mealId);
  if (!updated) throw new MealServiceError("unavailable", "The meal was updated but could not be reloaded.");
  return updated;
}

export async function addMealPhotos(userId: string, mealId: string, files: Array<{ id?: string; filename?: string | null; mimeType: MealPhotoMime; size: number; data: ArrayBuffer; origin: MealOrigin }>, options: { idempotencyKey?: string } = {}) {
  assertMealId(mealId);
  const meal = await findMeal(userId, mealId);
  if (!meal) throw new MealServiceError("not_found", "Meal not found.");
  if (files.length < 1) throw new MealServiceError("invalid", "Add at least one photo.");
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > MAX_MEAL_PHOTOS_BYTES) throw new MealServiceError("invalid", "The selected photos are too large together.");
  files.forEach((file) => assertPhotoSize(file.size));

  const uploadLock = options.idempotencyKey ? `meal-photos:${userId}:${mealId}:${options.idempotencyKey}` : null;
  if (uploadLock) {
    const claimed = await claimCloudflareLock(uploadLock, userId, 60_000);
    if (!claimed) {
      const existing = await findPhotosByUploadIdempotencyKey(userId, mealId, options.idempotencyKey as string);
      if (existing.length) return existing;
      throw new MealServiceError("conflict", "This photo upload is already being processed.");
    }
    const existing = await findPhotosByUploadIdempotencyKey(userId, mealId, options.idempotencyKey as string);
    if (existing.length) {
      await releaseCloudflareLock(uploadLock, userId).catch(() => undefined);
      return existing;
    }
  }
  const storedPhotoCount = meal.photos.filter((photo) => (photo.storageStatus ?? "available") !== "purged").length;
  if (storedPhotoCount + files.length > MAX_MEAL_PHOTOS) {
    if (uploadLock) await releaseCloudflareLock(uploadLock, userId).catch(() => undefined);
    throw new MealServiceError("invalid", `A meal can contain at most ${MAX_MEAL_PHOTOS} photos.`);
  }

  const stored: string[] = [];
  const insertedIds: string[] = [];
  try {
    const photos = [];
    for (const file of files) {
      const id = file.id ?? crypto.randomUUID();
      const objectPath = mealPhotoObjectPath(userId, mealId, id, file.mimeType);
      await putR2MealPhotoObject(objectPath, file.data, file.mimeType);
      stored.push(objectPath);
      insertedIds.push(id);
      photos.push(await insertPhoto({
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
      }));
    }
    if (meal.status === "confirmed") await updateMeal(userId, mealId, { status: "draft" });
    return photos;
  } catch (error) {
    // Metadata and R2 are kept together as far as possible. A failed D1 write
    // must not leave an inaccessible private photo behind.
    await Promise.all(stored.map((path) => deleteR2MealPhotoObject(path).catch(() => undefined)));
    await Promise.all(insertedIds.map((id) => deletePhoto(userId, mealId, id).catch(() => undefined)));
    if (error instanceof MealServiceError) throw error;
    throw new MealServiceError("unavailable", "The meal photos could not be saved.");
  } finally {
    if (uploadLock) await releaseCloudflareLock(uploadLock, userId).catch(() => undefined);
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

export async function analyzeMeal(userId: string, mealId: string, options: { force?: boolean; correction?: MealAnalysisCorrection; provider?: MealVisionProvider } = {}) {
  assertMealId(mealId);
  const meal = await findMeal(userId, mealId);
  if (!meal) throw new MealServiceError("not_found", "Meal not found.");
  const lockKey = `meal-analysis:${userId}:${mealId}`;
  const claimed = await claimCloudflareLock(lockKey, userId, 120_000);
  if (!claimed) throw new MealServiceError("conflict", "This meal is already being analysed.");
  try {
    const currentMeal = await findMeal(userId, mealId);
    if (!currentMeal) throw new MealServiceError("not_found", "Meal not found.");
    const note = currentMeal.note?.trim() ?? "";
    // A confirmed meal keeps photo metadata but its binaries are purged. Never
    // try to send those paths back to Grok; a new analysis can use a note or
    // newly uploaded available photos only.
    const availablePhotos = currentMeal.photos.filter((photo) => (photo.storageStatus ?? "available") === "available");
    const hasPhotos = availablePhotos.length > 0;
    const sourceFingerprint = await computeMealSourceFingerprint({ note: currentMeal.note, photos: currentMeal.photos });
    const current = await findLatestMealAnalysis(userId, mealId);
    const lastSuccessful = currentMeal.lastSuccessfulAnalysis ?? (current?.status === "completed" && current.result ? current : null);
    if (!hasPhotos && !note) {
      if (lastSuccessful) return { analysis: lastSuccessful, fresh: false };
      throw new MealServiceError("invalid", "Ajoute une photo ou une courte description avant l'analyse.");
    }
    if (hasPhotos && !availablePhotos.every((photo) => isXaiVisionMimeType(photo.mimeType))) throw new MealServiceError("invalid", "Grok analyse actuellement les photos JPEG et PNG uniquement.");
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
      provider: options.provider?.name ?? "xai",
      model: options.provider?.model ?? process.env.XAI_MEAL_VISION_MODEL ?? "grok-4.6",
      result: null,
      error: null,
      source_fingerprint: sourceFingerprint,
      source_photo_ids: sourcePhotoIds,
      created_at: createdAt,
      completed_at: null,
    });
    try {
      const images = [];
      for (const photo of availablePhotos) {
        const object = await getR2MealPhotoObject(photo.objectPath);
        if (!object) throw new MealServiceError("unavailable", "Une photo du repas n’est plus disponible.", "source_unavailable");
        images.push({ id: photo.id, mimeType: photo.mimeType, origin: photo.origin, data: await object.arrayBuffer() });
      }
      const input = { mealType: currentMeal.mealType, mealDate: currentMeal.mealDate, note: note || null, images, ...(options.correction ? { correction: options.correction } : {}) };
      const analysed = await analyzeMealInput(input, options.provider);
      let canonicalResult;
      try {
        canonicalResult = validateMealAnalysis(analysed.result);
      } catch {
        throw new MealServiceError("unavailable", "L’analyse du repas a retourné des données incohérentes. Réessaie.", "invalid_response");
      }
      const completed = await updateMealAnalysis(userId, analysisId, {
        status: "completed",
        provider: analysed.provider,
        model: analysed.model,
        result: canonicalResult,
        source_fingerprint: sourceFingerprint,
        error: null,
        completed_at: new Date().toISOString(),
      });
      return { analysis: completed, fresh: true };
    } catch (error) {
      const visionError = error instanceof MealVisionError ? error : null;
      const safeError = error instanceof MealServiceError ? error.message : visionError?.message ?? "Grok est momentanément indisponible.";
      const errorCode = error instanceof MealServiceError ? error.diagnosticCode ?? "source_unavailable" : visionError?.code ?? "provider_unavailable";
      let failed = null;
      for (let attempt = 0; attempt < 2 && !failed; attempt += 1) {
        failed = await updateMealAnalysis(userId, analysisId, { status: "failed", error: safeError, error_code: errorCode, source_fingerprint: sourceFingerprint, completed_at: new Date().toISOString() }).catch(() => null);
      }
      if (error instanceof MealServiceError) throw error;
      throw new MealServiceError("unavailable", failed?.error ?? safeError, errorCode);
    }
  } finally {
    await releaseCloudflareLock(lockKey, userId).catch(() => undefined);
  }
}

function nutritionEstimate(value: { low: number; likely: number; high: number } | null | undefined): NutritionEstimate | null {
  if (!value || !Number.isFinite(value.low) || !Number.isFinite(value.likely) || !Number.isFinite(value.high) || value.low < 0 || value.low > value.likely || value.likely > value.high) return null;
  return { low: value.low, likely: value.likely, high: value.high };
}

function mealOrigin(meal: Meal): ConfirmedMealRecord["origin"] {
  const origins = new Set(meal.photos.map((photo) => photo.origin));
  return origins.size === 0 ? "unknown" : origins.size === 1 ? [...origins][0] : "mixed";
}

/**
 * Adapter consumed by Personal Lab. Drafts, unanalysed meals and failed
 * analyses are deliberately omitted: a missing estimate is not a zero.
 */
export async function loadConfirmedMealRecords(userId: string, options: { from?: string; to?: string } = {}): Promise<ConfirmedMealRecord[]> {
  const meals = await listMeals(userId, { ...options, preferLatestCompletedAnalysis: true });
  return meals.flatMap((meal) => {
    if (meal.status !== "confirmed" || meal.analysis?.status !== "completed" || !meal.analysis.result) return [];
    const totals = meal.analysis.result.totals;
    return [{
      id: meal.id,
      mealDate: meal.mealDate,
      mealType: meal.mealType,
      status: "confirmed" as const,
      origin: mealOrigin(meal),
      caloriesKcal: nutritionEstimate(totals.calories),
      proteinG: nutritionEstimate(totals.proteinGrams),
      carbsG: nutritionEstimate(totals.carbohydrateGrams),
      fatG: nutritionEstimate(totals.fatGrams),
      fiberG: nutritionEstimate(totals.fiberGrams),
      sugarG: nutritionEstimate(totals.sugarGrams),
      addedSugarG: nutritionEstimate(totals.addedSugarGrams),
      mouthHeat: meal.mouthWarmthIntensity,
      stomachOverfullness: meal.stomachOverfullIntensity,
      photoIds: meal.photos.map((photo) => photo.id),
    } satisfies ConfirmedMealRecord];
  });
}

export { deleteMeal, findMeal, findMealPhoto, listMealPhotos, listMeals };
