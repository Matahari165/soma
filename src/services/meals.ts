import "server-only";

import {
  MAX_MEAL_PHOTO_BYTES,
  MAX_MEAL_PHOTOS,
  MAX_MEAL_PHOTOS_BYTES,
  normalizeMealFeeling,
  type CreateMealInput,
  type Meal,
  type MealFeeling,
  type MealOrigin,
  type MealPhotoMime,
  type UpdateMealInput,
} from "@/domain/meals";
import type { ConfirmedMealRecord, NutritionEstimate } from "@/domain/lab/meals";
import { analyzeMealImages, isXaiVisionMimeType, type MealVisionProvider } from "@/integrations/xai/meal-vision";
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
  upsertMealFeelings,
} from "@/repositories/meals";

export class MealServiceError extends Error {
  constructor(readonly code: "not_found" | "invalid" | "conflict" | "unavailable", message: string) {
    super(message);
    this.name = "MealServiceError";
  }
}

function assertMealId(id: string) {
  if (!/^[0-9a-f-]{20,80}$/i.test(id)) throw new MealServiceError("invalid", "The meal id is invalid.");
}

function assertPhotoSize(size: number) {
  if (size <= 0 || size > MAX_MEAL_PHOTO_BYTES) throw new MealServiceError("invalid", "Each photo must be between 1 byte and 12 MB.");
}

export async function createMeal(userId: string, input: CreateMealInput) {
  if (input.status === "confirmed") throw new MealServiceError("invalid", "Add photos before confirming a meal.");
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
  if (input.confirmedAnalysis && input.status !== "confirmed") throw new MealServiceError("invalid", "An edited analysis is saved when the meal is confirmed.");
  if (input.status === "confirmed" && current.photos.length === 0) {
    throw new MealServiceError("invalid", "Add at least one photo before confirming a meal.");
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
  if (input.confirmedAnalysis) {
    await insertMealAnalysis({
      id: crypto.randomUUID(),
      user_id: userId,
      meal_id: mealId,
      status: "completed",
      provider: "user",
      model: "confirmed-v1",
      result: input.confirmedAnalysis,
      error: null,
      source_photo_ids: current.photos.map((photo) => photo.id),
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });
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
  if (meal.photos.length + files.length > MAX_MEAL_PHOTOS) {
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

export async function analyzeMeal(userId: string, mealId: string, options: { force?: boolean; provider?: MealVisionProvider } = {}) {
  assertMealId(mealId);
  const meal = await findMeal(userId, mealId);
  if (!meal) throw new MealServiceError("not_found", "Meal not found.");
  if (!meal.photos.length) throw new MealServiceError("invalid", "Add at least one photo before analysing a meal.");
  if (!meal.photos.every((photo) => isXaiVisionMimeType(photo.mimeType))) throw new MealServiceError("invalid", "Grok analyse actuellement les photos JPEG et PNG uniquement.");
  const lockKey = `meal-analysis:${userId}:${mealId}`;
  const claimed = await claimCloudflareLock(lockKey, userId, 120_000);
  if (!claimed) throw new MealServiceError("conflict", "This meal is already being analysed.");
  try {
    const current = await findLatestMealAnalysis(userId, mealId);
    if (current?.status === "completed" && !options.force) return { analysis: current, fresh: false };
    const sourcePhotoIds = meal.photos.map((photo) => photo.id);
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
      source_photo_ids: sourcePhotoIds,
      created_at: createdAt,
      completed_at: null,
    });
    try {
      const images = [];
      for (const photo of meal.photos) {
        const object = await getR2MealPhotoObject(photo.objectPath);
        if (!object) throw new MealServiceError("unavailable", "One meal photo is no longer available.");
        images.push({ id: photo.id, mimeType: photo.mimeType, origin: photo.origin, data: await object.arrayBuffer() });
      }
      const analysed = await analyzeMealImages({ mealType: meal.mealType, mealDate: meal.mealDate, note: meal.note, images }, options.provider);
      const completed = await updateMealAnalysis(userId, analysisId, {
        status: "completed",
        provider: analysed.provider,
        model: analysed.model,
        result: analysed.result,
        error: null,
        completed_at: new Date().toISOString(),
      });
      return { analysis: completed, fresh: true };
    } catch (error) {
      const safeError = error instanceof MealServiceError ? error.message : "Grok meal analysis is temporarily unavailable.";
      const failed = await updateMealAnalysis(userId, analysisId, { status: "failed", error: safeError, completed_at: new Date().toISOString() });
      if (error instanceof MealServiceError) throw error;
      throw new MealServiceError("unavailable", failed.error ?? safeError);
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
  return origins.size === 1 ? [...origins][0] : "mixed";
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
      mouthHeat: meal.mouthWarmthIntensity,
      stomachOverfullness: meal.stomachOverfullIntensity,
      photoIds: meal.photos.map((photo) => photo.id),
    } satisfies ConfirmedMealRecord];
  });
}

export { deleteMeal, findMeal, findMealPhoto, listMealPhotos, listMeals };
