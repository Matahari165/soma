import "server-only";

import { MAX_MEAL_PHOTOS, MAX_MEAL_PHOTOS_BYTES, type Meal, type MealOrigin, type MealPhotoMime } from "@/domain/meals";
import { isXaiVisionMimeType } from "@/integrations/xai/meal-vision";
import { deleteR2MealPhotoObject, getR2MealPhotoObject, mealPhotoObjectPath, putR2MealPhotoObject } from "@/lib/r2";
import {
  createMealPhotoUploadJob,
  deleteMealPhotoUploadJob,
  deletePhoto,
  findMeal,
  findMealPhoto,
  findPhotosByUploadIdempotencyKey,
  insertPhoto,
  listFailedMealAnalysesForPhotoPurge,
  listMealPhotosForFailedAnalysisPurge,
  listMealPhotoRowsForReconciliation,
  listStaleMealPhotoUploadJobs,
  updateMeal,
  updateMealAnalysis,
  updatePhotoDetails,
  updatePhotoOrigin,
  updatePhotoStorage,
} from "@/repositories/meals";

import {
  FAILED_ANALYSIS_PHOTO_TTL_MS,
  assertMealId,
  assertPhotoSize,
  logMeal,
  MealServiceError,
  rowPhotoIds,
  timedMealStage,
  claimMealLease,
  releaseMealLease,
} from "./meals-shared";

const PHOTO_PURGE_ERROR = "Les photos du repas n’ont pas pu être purgées. Réessaie pour terminer la confirmation.";

export async function loadMealPhotoForAnalysis(objectPath: string, timeoutMs = 6_000) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const object = await getR2MealPhotoObject(objectPath, controller.signal);
        if (!object) throw new MealServiceError("unavailable", "Une photo du repas n’est plus disponible.", "source_unavailable");
        return object.arrayBuffer();
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new MealServiceError("unavailable", "Le téléchargement de la photo a expiré. Réessaie.", "storage_error"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function photoPurgeError() {
  return new MealServiceError("unavailable", PHOTO_PURGE_ERROR, "photo_purge_pending");
}

async function setPhotoStorageState(userId: string, mealId: string, photoId: string, storageStatus: "available" | "purge_pending" | "purged", purgedAt: string | null) {
  try {
    const updated = await updatePhotoStorage(userId, mealId, photoId, { storageStatus, purgedAt });
    if (!updated) throw photoPurgeError();
  } catch (error) {
    logMeal("error", "photo_storage", error);
    throw photoPurgeError();
  }
}
export async function purgeMealPhoto(userId: string, mealId: string, photo: Pick<Meal["photos"][number], "id" | "objectPath">) {
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
    logMeal("error", "photo_purge", error);
    throw photoPurgeError();
  }
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
    // Draft photos are still the user's evidence, regardless of their age.
    // Only an explicit pending purge or a confirmed meal may release them.
    if (!meal || (status === "available" && meal.status !== "confirmed")) continue;
    const photo = meal.photos.find((candidate) => candidate.id === row.id);
    if (!photo) continue;
    attempted += 1;
    try {
      await timedMealStage("photo_purge_retry", () => purgeMealPhoto(String(row.user_id), String(row.meal_id), photo));
      purged += 1;
    } catch (error) {
      logMeal("warn", "photo_purge_retry_deferred", error);
    }
  }
  return { attempted, purged };
}

/** Only cleanup keys recorded before upload and still without a photo row after two hours. */
export async function reconcileAbandonedMealPhotoUploads(limit = 100) {
  const before = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
  const jobs = await listStaleMealPhotoUploadJobs(before, limit);
  let cleared = 0;
  for (const job of jobs) {
    try {
      const photo = await findMealPhoto(job.user_id, job.meal_id, job.photo_id);
      if (!photo || photo.objectPath !== job.object_path) await deleteR2MealPhotoObject(job.object_path);
      await deleteMealPhotoUploadJob(job.user_id, job.id);
      cleared += 1;
    } catch {
      // Leave the durable key for the next cron run.
    }
  }
  return { attempted: jobs.length, cleared };
}

/** Purge evidence for failures that have exceeded the 24-hour retention window. */
export async function purgeExpiredFailedAnalysisPhotos(now = Date.now()) {
  const cutoff = new Date(now - FAILED_ANALYSIS_PHOTO_TTL_MS).toISOString();
  const rows = await listFailedMealAnalysesForPhotoPurge(cutoff, 100);
  let purged = 0;
  for (const row of rows) {
    const failedAt = Date.parse(String(row.failure_started_at ?? row.completed_at ?? row.updated_at ?? row.created_at));
    if (!Number.isFinite(failedAt) || now - failedAt < FAILED_ANALYSIS_PHOTO_TTL_MS) continue;
    const userId = String(row.user_id);
    const mealId = String(row.meal_id);
    const sourceIds = rowPhotoIds(row);
    const hasSourceSnapshot = Array.isArray(row.source_photo_ids);
    let photos;
    try {
      // An absent legacy snapshot falls back to all photos. A persisted empty
      // snapshot means this analysis used no photos and must not purge newer evidence.
      photos = await listMealPhotosForFailedAnalysisPurge(userId, mealId, hasSourceSnapshot ? sourceIds : undefined);
    } catch (error) {
      logMeal("error", "photo_purge_failed_ttl_load", error);
      continue;
    }
    let complete = true;
    for (const photo of photos.filter((candidate) => candidate.storageStatus !== "purged")) {
      try {
        await timedMealStage("photo_purge_failed_ttl", () => purgeMealPhoto(userId, mealId, photo));
        purged += 1;
      } catch (error) {
        complete = false;
        logMeal("warn", "photo_purge_failed_ttl_deferred", error);
      }
    }
    if (!complete) continue;
    try {
      await updateMealAnalysis(userId, String(row.id), { photo_purge_completed_at: new Date(now).toISOString() }, "failed");
    } catch (error) {
      logMeal("error", "photo_purge_failed_ttl_mark", error);
      throw error;
    }
  }
  return purged;
}
export async function addMealPhotos(userId: string, mealId: string, files: Array<{ id?: string; filename?: string | null; comment?: string | null; mimeType: MealPhotoMime; size: number; data: ArrayBuffer; origin: MealOrigin }>, options: { idempotencyKey?: string } = {}) {
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

    const uploadJobs: Array<{ id: string; photoId: string; objectPath: string }> = [];
    try {
      const photos = [];
      for (let index = 0; index < files.length; index += 2) {
        const batch = files.slice(index, index + 2);
        const uploaded = await Promise.allSettled(batch.map(async (file) => {
          const id = file.id ?? crypto.randomUUID();
          const objectPath = mealPhotoObjectPath(userId, mealId, id, file.mimeType);
          const jobId = crypto.randomUUID();
          await createMealPhotoUploadJob({ id: jobId, user_id: userId, meal_id: mealId, photo_id: id, object_path: objectPath, created_at: new Date().toISOString() });
          uploadJobs.push({ id: jobId, photoId: id, objectPath });
          await timedMealStage("photo_upload", () => putR2MealPhotoObject(objectPath, file.data, file.mimeType));
          const photo = await insertPhoto({
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
            comment: file.comment?.trim().slice(0, 240) || null,
            storage_status: "available",
            purged_at: null,
          });
          return photo;
        }));
        const failed = uploaded.find((result) => result.status === "rejected");
        if (failed?.status === "rejected") throw failed.reason;
        photos.push(...uploaded.flatMap((result) => result.status === "fulfilled" ? [result.value] : []));
      }
      if (meal.status === "confirmed") await updateMeal(userId, mealId, { status: "draft" });
      await Promise.all(uploadJobs.map((job) => deleteMealPhotoUploadJob(userId, job.id).catch(() => {
        // A stale job with a valid photo row is safe for the reconciler to clear.
      })));
      return photos;
    } catch (error) {
      // Keep the durable job until both metadata and R2 cleanup have succeeded.
      await Promise.all(uploadJobs.map(async (job) => {
        try {
          const photo = await findMealPhoto(userId, mealId, job.photoId);
          if (photo) {
            if (photo.objectPath !== job.objectPath) throw new Error("Photo object path changed during cleanup.");
            await deletePhoto(userId, mealId, job.photoId);
          }
          await deleteR2MealPhotoObject(job.objectPath);
          await deleteMealPhotoUploadJob(userId, job.id);
        } catch (cleanupError) {
          logMeal("error", "photo_r2_cleanup", cleanupError);
        }
      }));
      if (error instanceof MealServiceError) throw error;
      throw new MealServiceError("unavailable", "The meal photos could not be saved.");
    }
  } finally {
    await releaseMealLease(uploadLock, userId, lease.token).catch((error) => logMeal("error", "photo_lock_release", error));
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

export async function updateMealPhotoDetails(userId: string, mealId: string, photoId: string, values: { origin?: MealOrigin; comment?: string | null }) {
  assertMealId(mealId);
  if (!/^[0-9a-f-]{20,80}$/i.test(photoId)) throw new MealServiceError("invalid", "The photo id is invalid.");
  const comment = values.comment === undefined ? undefined : values.comment?.trim().slice(0, 240) || null;
  const update = { ...values };
  if (comment !== undefined) update.comment = comment;
  const updated = await updatePhotoDetails(userId, mealId, photoId, update);
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
