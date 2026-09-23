import "server-only";

import {
  normalizeMealFeeling,
  validateMealAnalysis,
  type CreateMealInput,
  type MealFeeling,
  type UpdateMealInput,
} from "@/domain/meals";
import {
  deleteMeal as deleteMealRecord,
  findActiveMealAnalysis,
  findMeal,
  findMealByIdempotencyKey,
  findMealForSlot,
  insertMeal,
  insertMealAnalysis,
  updateMeal,
  upsertMealFeelings,
} from "@/repositories/meals";
import * as cloudflareDb from "@/lib/cloudflare/db";

import { finalizeMealAnalysis } from "./meals-analysis";
import {
  analysisUsedForConfirmation,
  assertMealId,
  computeMealSourceFingerprint,
  hasPreservedAnalysis,
  logMeal,
  MealServiceError,
} from "./meals-shared";

const { claimCloudflareLock, releaseCloudflareLock } = cloudflareDb;

export async function deleteMeal(userId: string, mealId: string) {
  if (await findActiveMealAnalysis(userId, mealId)) {
    throw new MealServiceError("conflict", "Wait for the current analysis to finish before deleting this meal.");
  }
  return deleteMealRecord(userId, mealId);
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
        logMeal("error", "meal_create_lock_release", error);
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
  if (input.status === "confirmed" && (input.analysisRequestId || input.analysisSourceRevision || input.analysisSourceFingerprint)) {
    const analysis = analysisUsedForConfirmation(current);
    if (!analysis
      || (input.analysisRequestId && analysis.analysisRequestId !== input.analysisRequestId)
      || (input.analysisSourceRevision && analysis.sourceRevision !== input.analysisSourceRevision)
      || (input.analysisSourceFingerprint && analysis.sourceFingerprint !== input.analysisSourceFingerprint)) {
      throw new MealServiceError("invalid", "Le résultat à confirmer n’est plus celui des preuves actuelles. Relance l’analyse.", "source_unavailable");
    }
  }
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
