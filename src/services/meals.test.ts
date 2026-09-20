import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  findMeal: vi.fn(),
  findActiveMealAnalysis: vi.fn(),
  deleteMeal: vi.fn(),
  findMealAnalysisByRequestId: vi.fn(),
  findMealForSlot: vi.fn(),
  insertMeal: vi.fn(),
  insertMealAnalysis: vi.fn(),
  listMeals: vi.fn(),
  updateMeal: vi.fn(),
  updatePhotoOrigin: vi.fn(),
  updatePhotoStorage: vi.fn(),
  upsertMealFeelings: vi.fn(),
  findRelevantMealRecipeReferences: vi.fn(),
  touchMealAnalysis: vi.fn(),
}));

vi.mock("@/repositories/meals", () => ({
  deleteMeal: state.deleteMeal, deletePhoto: vi.fn(), findActiveMealAnalysis: state.findActiveMealAnalysis, findLatestMealAnalysis: vi.fn(), findMealAnalysisByRequestId: state.findMealAnalysisByRequestId, findMeal: state.findMeal, findMealByIdempotencyKey: vi.fn(), findMealForSlot: state.findMealForSlot, findMealPhoto: vi.fn(), findPhotosByUploadIdempotencyKey: vi.fn(), insertMeal: state.insertMeal, insertMealAnalysis: state.insertMealAnalysis, insertPhoto: vi.fn(), listMealPhotos: vi.fn(), listMeals: state.listMeals, touchMealAnalysis: state.touchMealAnalysis, updateMeal: state.updateMeal, updateMealAnalysis: vi.fn(), updatePhotoOrigin: state.updatePhotoOrigin, updatePhotoStorage: state.updatePhotoStorage, upsertMealFeelings: state.upsertMealFeelings,
}));
vi.mock("@/lib/cloudflare/db", () => ({ claimCloudflareLock: vi.fn(), releaseCloudflareLock: vi.fn(), claimCloudflareLockWithToken: vi.fn(), refreshCloudflareLockWithToken: vi.fn(), releaseCloudflareLockWithToken: vi.fn() }));
vi.mock("@/lib/r2", () => ({ deleteR2MealPhotoObject: vi.fn(), getR2MealPhotoObject: vi.fn(), mealPhotoObjectPath: vi.fn(), putR2MealPhotoObject: vi.fn() }));
vi.mock("@/services/meal-recipes", () => ({ findRelevantMealRecipeReferences: state.findRelevantMealRecipeReferences }));

import { computeMealSourceFingerprint, createMeal, addMealPhotos, analyzeMeal, deleteMeal, loadConfirmedMealRecords, MealServiceError, updateMealPhotoOrigin, updateMealRecord } from "./meals";
import { findLatestMealAnalysis, touchMealAnalysis, updateMealAnalysis } from "@/repositories/meals";
import { claimCloudflareLock, claimCloudflareLockWithToken, refreshCloudflareLockWithToken, releaseCloudflareLock } from "@/lib/cloudflare/db";
import { deleteR2MealPhotoObject, getR2MealPhotoObject } from "@/lib/r2";

const canonicalCorrection = {
  summary: "Correction utilisateur",
  dishType: null,
  calorieAnalysis: null,
  foods: [],
  totals: { calories: { low: 500, likely: 600, high: 700 }, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null },
  confidence: "medium" as const,
  uncertainties: [],
};

describe("meal analysis provenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.findRelevantMealRecipeReferences.mockResolvedValue([]);
    state.findActiveMealAnalysis.mockResolvedValue(null);
    state.deleteMeal.mockResolvedValue(true);
    const meal = { id: "12345678-1234-1234-1234-123456789012", userId: "user-1", mealDate: "2026-08-31", mealType: "lunch" as const, note: null, status: "draft" as const, mouthWarmthIntensity: null, stomachOverfullIntensity: null, createdAt: "2026-08-31T10:00:00.000Z", updatedAt: "2026-08-31T10:00:00.000Z", photos: [{ id: "photo-1", mealId: "12345678-1234-1234-1234-123456789012", origin: "homemade" as const, objectPath: "private/photo", mimeType: "image/jpeg" as const, bytes: 10, createdAt: "2026-08-31T10:00:00.000Z" }], analysis: { id: "analysis-xai", mealId: "12345678-1234-1234-1234-123456789012", status: "completed" as const, provider: "xai", model: "grok-4.6", result: null, error: null, sourcePhotoIds: ["photo-1"], createdAt: "2026-08-31T10:01:00.000Z", completedAt: "2026-08-31T10:01:01.000Z" } };
    state.findMeal.mockResolvedValue(meal);
    state.findMealForSlot.mockResolvedValue(null);
    state.insertMealAnalysis.mockResolvedValue({ ...meal.analysis, id: "analysis-user", provider: "user", model: "confirmed-v1", result: canonicalCorrection });
    state.updatePhotoStorage.mockResolvedValue({ id: "photo-1" });
  });

  it.each(["queued", "running"])("refuse la suppression pendant une analyse %s", async (status) => {
    state.findActiveMealAnalysis.mockResolvedValue({ id: "analysis-active", status });

    await expect(deleteMeal("user-1", "12345678-1234-1234-1234-123456789012")).rejects.toMatchObject({ code: "conflict" });
    expect(state.deleteMeal).not.toHaveBeenCalled();
  });

  it("supprime le repas lorsqu’aucune analyse n’est active", async () => {
    await expect(deleteMeal("user-1", "12345678-1234-1234-1234-123456789012")).resolves.toBe(true);
    expect(state.deleteMeal).toHaveBeenCalledWith("user-1", "12345678-1234-1234-1234-123456789012");
  });

  it("stores a user correction as a new analysis without replacing the Grok run", async () => {
    await updateMealRecord("user-1", "12345678-1234-1234-1234-123456789012", { status: "confirmed", mouthWarmthIntensity: 2, stomachOverfullIntensity: 3, confirmedAnalysis: canonicalCorrection });
    expect(state.insertMealAnalysis).toHaveBeenCalledWith(expect.objectContaining({ provider: "user", model: "confirmed-v1", status: "completed", result: canonicalCorrection, source_fingerprint: expect.any(String), source_photo_ids: ["photo-1"] }));
  });

  it("refuses confirmation when the note changes after the analysis", async () => {
    const photos = [{ id: "photo-1", mealId: "12345678-1234-1234-1234-123456789012", origin: "homemade" as const, objectPath: "private/photo", mimeType: "image/jpeg" as const, bytes: 10, createdAt: "2026-08-31T10:00:00.000Z" }];
    const sourceFingerprint = await computeMealSourceFingerprint({ note: null, photos });
    state.findMeal.mockResolvedValue({
      id: "12345678-1234-1234-1234-123456789012", userId: "user-1", mealDate: "2026-08-31", mealType: "lunch" as const,
      note: null, status: "draft" as const, mouthWarmthIntensity: null, stomachOverfullIntensity: null,
      createdAt: "2026-08-31T10:00:00.000Z", updatedAt: "2026-08-31T10:00:00.000Z",
      photos,
      analysis: { id: "analysis-xai", mealId: "12345678-1234-1234-1234-123456789012", status: "completed" as const, provider: "xai", model: "grok-4.6", result: canonicalCorrection, error: null, sourceFingerprint, sourcePhotoIds: ["photo-1"], createdAt: "2026-08-31T10:01:00.000Z", completedAt: "2026-08-31T10:01:01.000Z" },
    });
    await expect(updateMealRecord("user-1", "12345678-1234-1234-1234-123456789012", { status: "confirmed", note: "Une nouvelle note" })).rejects.toMatchObject({ code: "invalid", message: "Les preuves du repas ont changé. Relance l’analyse avant de confirmer ce repas." });
    expect(state.updateMeal).not.toHaveBeenCalled();
  });

  it("binds native confirmation to the exact analysis identity and source", async () => {
    const photos = [{ id: "photo-1", mealId: "12345678-1234-1234-1234-123456789012", origin: "homemade" as const, objectPath: "private/photo", mimeType: "image/jpeg" as const, bytes: 10, createdAt: "2026-08-31T10:00:00.000Z" }];
    const sourceFingerprint = await computeMealSourceFingerprint({ note: null, photos });
    state.findMeal.mockResolvedValue({
      id: "12345678-1234-1234-1234-123456789012", userId: "user-1", mealDate: "2026-08-31", mealType: "lunch" as const,
      note: null, status: "draft" as const, mouthWarmthIntensity: null, stomachOverfullIntensity: null,
      createdAt: "2026-08-31T10:00:00.000Z", updatedAt: "revision-1", photos,
      analysis: { id: "analysis-xai", mealId: "12345678-1234-1234-1234-123456789012", status: "completed" as const, provider: "xai", model: "grok-4.6", result: canonicalCorrection, error: null, analysisRequestId: "request-1", sourceRevision: "revision-1", sourceFingerprint, sourcePhotoIds: ["photo-1"], createdAt: "2026-08-31T10:01:00.000Z", completedAt: "2026-08-31T10:01:01.000Z" },
    });

    await expect(updateMealRecord("user-1", "12345678-1234-1234-1234-123456789012", { status: "confirmed", analysisRequestId: "request-old", analysisSourceRevision: "revision-1", analysisSourceFingerprint: sourceFingerprint })).rejects.toMatchObject({ code: "invalid" });
    expect(state.updateMeal).not.toHaveBeenCalled();
  });

  it("keeps the source fingerprint stable and changes it when photo proof changes", async () => {
    const photos = [{ id: "photo-1", mealId: "meal", origin: "homemade" as const, objectPath: "private/photo", mimeType: "image/jpeg" as const, bytes: 1, createdAt: "2026-08-31T10:00:00.000Z" }];
    const first = await computeMealSourceFingerprint({ note: "Pâtes", photos });
    const reordered = await computeMealSourceFingerprint({ note: " Pâtes ", photos: [...photos].reverse() });
    const changed = await computeMealSourceFingerprint({ note: "Pâtes", photos: photos.map((photo) => ({ ...photo, origin: "prepared" as const })) });
    const commentChanged = await computeMealSourceFingerprint({ note: "Pâtes", photos: photos.map((photo) => ({ ...photo, comment: "Sauce à gauche" })) });
    expect(reordered).toBe(first);
    expect(changed).not.toBe(first);
    expect(commentChanged).not.toBe(first);
  });

  it("refuses to purge a photo-only meal without a completed analysis", async () => {
    await expect(updateMealRecord("user-1", "12345678-1234-1234-1234-123456789012", { status: "confirmed" })).rejects.toMatchObject({ code: "invalid", message: "Analyse les photos avant de confirmer ce repas." });
    expect(state.updateMeal).not.toHaveBeenCalled();
    expect(state.updatePhotoStorage).not.toHaveBeenCalled();
    expect(deleteR2MealPhotoObject).not.toHaveBeenCalled();
  });

  it("confirms immediately and keeps purge_pending when R2 is unavailable", async () => {
    state.findMeal.mockResolvedValue({
      id: "12345678-1234-1234-1234-123456789012",
      userId: "user-1",
      mealDate: "2026-08-31",
      mealType: "lunch" as const,
      note: null,
      status: "draft" as const,
      mouthWarmthIntensity: null,
      stomachOverfullIntensity: null,
      createdAt: "2026-08-31T10:00:00.000Z",
      updatedAt: "2026-08-31T10:00:00.000Z",
      photos: [{ id: "photo-1", mealId: "12345678-1234-1234-1234-123456789012", origin: "homemade" as const, objectPath: "private/photo", mimeType: "image/jpeg" as const, bytes: 10, createdAt: "2026-08-31T10:00:00.000Z", storageStatus: "available" as const }],
      analysis: { id: "analysis-xai", mealId: "12345678-1234-1234-1234-123456789012", status: "completed" as const, provider: "xai", model: "grok-4.6", result: canonicalCorrection, error: null, sourcePhotoIds: ["photo-1"], createdAt: "2026-08-31T10:01:00.000Z", completedAt: "2026-08-31T10:01:01.000Z" },
    });
    vi.mocked(deleteR2MealPhotoObject).mockRejectedValueOnce(new Error("R2 unavailable"));

    await expect(updateMealRecord("user-1", "12345678-1234-1234-1234-123456789012", { status: "confirmed" })).resolves.toMatchObject({ status: "draft" });
    expect(state.updatePhotoStorage).toHaveBeenCalledTimes(1);
    expect(state.updatePhotoStorage).toHaveBeenCalledWith("user-1", "12345678-1234-1234-1234-123456789012", "photo-1", { storageStatus: "purge_pending", purgedAt: null });
    expect(state.updateMeal).toHaveBeenCalledWith("user-1", "12345678-1234-1234-1234-123456789012", { status: "confirmed" });
  });

  it("confirms even when the pending marker cannot be written", async () => {
    state.updatePhotoStorage.mockRejectedValueOnce(new Error("D1 unavailable"));

    await expect(updateMealRecord("user-1", "12345678-1234-1234-1234-123456789012", { status: "confirmed", confirmedAnalysis: canonicalCorrection })).resolves.toMatchObject({ status: "draft" });
    expect(state.updateMeal).toHaveBeenCalledWith("user-1", "12345678-1234-1234-1234-123456789012", { status: "confirmed" });
    expect(deleteR2MealPhotoObject).not.toHaveBeenCalled();
  });

  it("leaves the already-written pending marker when the final state write fails", async () => {
    state.updatePhotoStorage.mockResolvedValueOnce({ id: "photo-1" }).mockRejectedValueOnce(new Error("D1 unavailable"));
    const meal = {
      id: "12345678-1234-1234-1234-123456789012",
      userId: "user-1",
      mealDate: "2026-08-31",
      mealType: "lunch" as const,
      note: null,
      status: "draft" as const,
      mouthWarmthIntensity: null,
      stomachOverfullIntensity: null,
      createdAt: "2026-08-31T10:00:00.000Z",
      updatedAt: "2026-08-31T10:00:00.000Z",
      photos: [{ id: "photo-1", mealId: "12345678-1234-1234-1234-123456789012", origin: "homemade" as const, objectPath: "private/photo", mimeType: "image/jpeg" as const, bytes: 10, createdAt: "2026-08-31T10:00:00.000Z", storageStatus: "available" as const }],
      analysis: { id: "analysis-xai", mealId: "12345678-1234-1234-1234-123456789012", status: "completed" as const, provider: "xai", model: "grok-4.6", result: canonicalCorrection, error: null, sourcePhotoIds: ["photo-1"], createdAt: "2026-08-31T10:01:00.000Z", completedAt: "2026-08-31T10:01:01.000Z" },
    };
    state.findMeal.mockResolvedValue(meal);

    await expect(updateMealRecord("user-1", meal.id, { status: "confirmed" })).resolves.toMatchObject({ status: "draft" });
    expect(state.updateMeal).toHaveBeenCalledWith("user-1", meal.id, { status: "confirmed" });
    expect(deleteR2MealPhotoObject).toHaveBeenCalledWith("private/photo");
    expect(state.updatePhotoStorage).toHaveBeenCalledTimes(2);
  });

  it("keeps explicit null feelings instead of falling back to the current rating", async () => {
    const current = { id: "12345678-1234-1234-1234-123456789012", userId: "user-1", mealDate: "2026-08-31", mealType: "lunch" as const, note: null, status: "draft" as const, mouthWarmthIntensity: 3, stomachOverfullIntensity: 4, createdAt: "2026-08-31T10:00:00.000Z", updatedAt: "2026-08-31T10:00:00.000Z", photos: [], analysis: null };
    state.findMeal.mockResolvedValue(current);
    await updateMealRecord("user-1", current.id, { mouthWarmthIntensity: null });
    expect(state.upsertMealFeelings).toHaveBeenCalledWith("user-1", current.id, { mouthWarmthIntensity: null, stomachOverfullIntensity: 4 });
  });

  it("returns the slot winner when an atomic insert races another creator", async () => {
    const winner = { id: "87654321-4321-4321-4321-210987654321", userId: "user-1", mealDate: "2026-08-31", mealType: "breakfast" as const, note: null, status: "draft" as const, mouthWarmthIntensity: null, stomachOverfullIntensity: null, createdAt: "2026-08-31T10:00:00.000Z", updatedAt: "2026-08-31T10:00:00.000Z", photos: [], analysis: null };
    state.findMealForSlot.mockReset();
    state.findMealForSlot.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: winner.id });
    state.insertMeal.mockResolvedValue({ id: "12345678-1234-1234-1234-123456789012" });
    state.findMeal.mockResolvedValue(winner);
    const result = await createMeal("user-1", { mealDate: "2026-08-31", mealType: "breakfast" });
    expect(result).toEqual({ meal: winner, created: false });
  });

  it("asks the repository for the latest completed analysis for the matrix", async () => {
    state.listMeals.mockResolvedValue([]);
    await loadConfirmedMealRecords("user-1", { from: "2026-08-01" });
    expect(state.listMeals).toHaveBeenCalledWith("user-1", { from: "2026-08-01", preferLatestCompletedAnalysis: true });
  });

  it("keeps a confirmed meal without analysis with null nutrition", async () => {
    state.listMeals.mockResolvedValue([{
      id: "12345678-1234-1234-1234-123456789012",
      userId: "user-1",
      mealDate: "2026-08-31",
      mealType: "lunch",
      note: "Repas confirmé",
      status: "confirmed",
      mouthWarmthIntensity: null,
      stomachOverfullIntensity: null,
      createdAt: "2026-08-31T10:00:00.000Z",
      updatedAt: "2026-08-31T10:00:00.000Z",
      photos: [],
      analysis: null,
    }]);

    const records = await loadConfirmedMealRecords("user-1");

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: "12345678-1234-1234-1234-123456789012", status: "confirmed", caloriesKcal: null, proteinG: null, carbsG: null, fatG: null, fiberG: null });
    expect(records[0]?.foods).toBeUndefined();
  });

  it("keeps portions and observation labels in the Personal Lab adapter", async () => {
    state.listMeals.mockResolvedValue([{
      id: "12345678-1234-1234-1234-123456789012",
      userId: "user-1",
      mealDate: "2026-08-31",
      mealType: "lunch",
      note: "Jus et riz",
      status: "confirmed",
      mouthWarmthIntensity: null,
      stomachOverfullIntensity: null,
      createdAt: "2026-08-31T10:00:00.000Z",
      updatedAt: "2026-08-31T10:00:00.000Z",
      photos: [],
      analysis: {
        id: "analysis-1",
        mealId: "12345678-1234-1234-1234-123456789012",
        status: "completed",
        provider: "xai",
        model: "grok",
        result: {
          summary: "Jus et riz",
          dishType: null,
          calorieAnalysis: null,
          foods: [{ name: "Jus", preparation: null, portion: "250 ml", estimatedGrams: 250, quantity: { value: 250, unit: "ml", basis: "étiquette", grams: 250 }, alcoholic: false, novaGroup: 4, sugarExposure: { concentrated: true, liquid: true }, qualityProperties: [], observation: { portion: "observed", novaGroup: "observed", sugarExposure: "observed", qualityProperties: "none_observed" }, calories: null, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null, sugarGrams: { low: 18, likely: 22, high: 28 }, addedSugarGrams: { low: 0, likely: 0, high: 0 }, confidence: "medium" }],
          totals: { calories: null, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null },
          confidence: "medium",
          uncertainties: [],
        },
        error: null,
        sourcePhotoIds: [],
        createdAt: "2026-08-31T10:00:00.000Z",
        completedAt: "2026-08-31T10:00:01.000Z",
      },
    }]);

    const records = await loadConfirmedMealRecords("user-1");

    expect(records[0]?.foods?.[0]).toMatchObject({ name: "Jus", portion: "250 ml", estimatedGrams: 250, quantity: { grams: 250 }, novaGroup: 4, sugarExposure: { concentrated: true, liquid: true }, sugarG: { low: 18, likely: 22, high: 28 }, addedSugarG: { low: 0, likely: 0, high: 0 }, qualityProperties: [], observation: { qualityProperties: "none_observed" } });
  });

  it("normalizes missing per-food sugar in an old analysis to null", async () => {
    state.listMeals.mockResolvedValue([{
      id: "12345678-1234-1234-1234-123456789012",
      userId: "user-1",
      mealDate: "2026-08-31",
      mealType: "lunch",
      note: "Ancienne analyse",
      status: "confirmed",
      mouthWarmthIntensity: null,
      stomachOverfullIntensity: null,
      createdAt: "2026-08-31T10:00:00.000Z",
      updatedAt: "2026-08-31T10:00:00.000Z",
      photos: [],
      analysis: {
        id: "analysis-legacy",
        mealId: "12345678-1234-1234-1234-123456789012",
        status: "completed",
        provider: "xai",
        model: "grok-old",
        result: {
          summary: "Ancienne analyse",
          dishType: null,
          calorieAnalysis: null,
          foods: [{ name: "Riz", preparation: null, portion: null, estimatedGrams: null, calories: null, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null, confidence: "low" }],
          totals: { calories: null, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null },
          confidence: "low",
          uncertainties: [],
        },
        error: null,
        sourcePhotoIds: [],
        createdAt: "2026-08-31T10:00:00.000Z",
        completedAt: "2026-08-31T10:00:01.000Z",
      },
    }]);

    const records = await loadConfirmedMealRecords("user-1");

    expect(records[0]?.foods?.[0]).toMatchObject({ sugarG: null, addedSugarG: null });
  });

  it("updates a photo origin and returns not-found from the repository", async () => {
    const photoId = "abcdef12-1234-1234-1234-123456789012";
    state.updatePhotoOrigin.mockResolvedValue({ id: photoId, mealId: "12345678-1234-1234-1234-123456789012", origin: "prepared", objectPath: "private/photo", mimeType: "image/jpeg", bytes: 10, createdAt: "2026-08-31T10:00:00.000Z" });
    await updateMealPhotoOrigin("user-1", "12345678-1234-1234-1234-123456789012", photoId, "prepared");
    expect(state.updatePhotoOrigin).toHaveBeenCalledWith("user-1", "12345678-1234-1234-1234-123456789012", photoId, "prepared");
    expect(state.updateMeal).toHaveBeenCalledWith("user-1", "12345678-1234-1234-1234-123456789012", { status: "draft" });
  });
});

describe("text meal confirmation without photo", () => {
  const baseId = "12345678-1234-1234-1234-123456789012";
  beforeEach(() => {
    vi.clearAllMocks();
    state.findRelevantMealRecipeReferences.mockResolvedValue([]);
    state.findMealForSlot.mockResolvedValue(null);
  });

  function textMeal(note: string | null) {
    return { id: baseId, userId: "user-1", mealDate: "2026-08-31", mealType: "lunch" as const, note, status: "draft" as const, mouthWarmthIntensity: 2, stomachOverfullIntensity: 3, createdAt: "2026-08-31T10:00:00.000Z", updatedAt: "2026-08-31T10:00:00.000Z", photos: [], analysis: null };
  }

  it("confirms a note-only meal such as '2 bananes'", async () => {
    state.findMeal.mockResolvedValue(textMeal("2 bananes"));
    await updateMealRecord("user-1", baseId, { status: "confirmed" });
    expect(state.updateMeal).toHaveBeenCalledWith("user-1", baseId, expect.objectContaining({ status: "confirmed" }));
  });

  it("confirms when the note arrives in the same update", async () => {
    state.findMeal.mockResolvedValue(textMeal(null));
    await updateMealRecord("user-1", baseId, { status: "confirmed", note: "2 bananes" });
    expect(state.updateMeal).toHaveBeenCalledWith("user-1", baseId, expect.objectContaining({ status: "confirmed", note: "2 bananes" }));
  });

  it("rejects confirmation without photo and without note", async () => {
    state.findMeal.mockResolvedValue(textMeal(null));
    await expect(updateMealRecord("user-1", baseId, { status: "confirmed" })).rejects.toMatchObject({ code: "invalid", message: "Ajoute une photo ou une courte description avant de confirmer." });
  });

  it("rejects confirmation when the note is blank", async () => {
    state.findMeal.mockResolvedValue(textMeal("   "));
    await expect(updateMealRecord("user-1", baseId, { status: "confirmed" })).rejects.toBeInstanceOf(MealServiceError);
  });
});

describe("meal text-only analysis", () => {
  const baseId = "12345678-1234-1234-1234-123456789012";
  const textOnlyAnalysis = {
    summary: "2 bananes, sans photo.",
    dishType: null,
    calorieAnalysis: "Environ 190 kcal (likely), un en-cas modéré.",
    foods: [{
      name: "Banane",
      preparation: null,
      portion: null,
      estimatedGrams: null,
      calories: { low: 150, likely: 190, high: 230 },
      proteinGrams: null,
      carbohydrateGrams: null,
      fatGrams: null,
      fiberGrams: null,
      confidence: "low" as const,
    }],
    totals: {
      calories: { low: 150, likely: 190, high: 230 },
      proteinGrams: null,
      carbohydrateGrams: null,
      fatGrams: null,
      fiberGrams: null,
    },
    confidence: "low" as const,
    uncertainties: ["Estimation à partir de la seule description, sans photo."],
  };

  function textMeal(note: string) {
    return { id: baseId, userId: "user-1", mealDate: "2026-08-31", mealType: "snack" as const, note, status: "draft" as const, mouthWarmthIntensity: null, stomachOverfullIntensity: null, createdAt: "2026-08-31T10:00:00.000Z", updatedAt: "2026-08-31T10:00:00.000Z", photos: [], analysis: null };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    state.findRelevantMealRecipeReferences.mockResolvedValue([]);
    vi.mocked(claimCloudflareLock).mockResolvedValue(true);
    vi.mocked(releaseCloudflareLock).mockResolvedValue(undefined);
    vi.mocked(findLatestMealAnalysis).mockResolvedValue(null);
    state.findMealAnalysisByRequestId.mockResolvedValue(null);
    vi.mocked(updateMealAnalysis).mockImplementation(async (_userId: string, id: string, values: Record<string, unknown>) => ({
      id,
      mealId: baseId,
      status: (values.status as "completed" | "failed") ?? "completed",
      provider: (values.provider as string) ?? "stub",
      model: (values.model as string) ?? "stub-1",
      result: (values.result as typeof textOnlyAnalysis | null) ?? null,
      error: (values.error as string | null) ?? null,
      sourcePhotoIds: [],
      createdAt: "2026-08-31T10:01:00.000Z",
      completedAt: "2026-08-31T10:01:01.000Z",
    }) as never);
  });

  it("analyses a note-only meal such as '2 bananes' without photos", async () => {
    state.findMeal.mockResolvedValue({ id: baseId, userId: "user-1", mealDate: "2026-08-31", mealType: "snack" as const, note: "2 bananes", status: "draft" as const, mouthWarmthIntensity: null, stomachOverfullIntensity: null, createdAt: "2026-08-31T10:00:00.000Z", updatedAt: "2026-08-31T10:00:00.000Z", photos: [], analysis: null });
    const analyzeText = vi.fn().mockResolvedValue(textOnlyAnalysis);
    const result = await analyzeMeal("user-1", baseId, { provider: { name: "stub", model: "stub-1", analyze: vi.fn(), analyzeText } });
    expect(analyzeText).toHaveBeenCalledWith({ mealType: "snack", mealDate: "2026-08-31", note: "2 bananes" });
    expect(state.insertMealAnalysis).toHaveBeenCalledWith(expect.objectContaining({ status: "running", source_photo_ids: [] }));
    expect(result).toMatchObject({ fresh: true, analysis: { status: "completed", result: textOnlyAnalysis } });
  });

  it("renews a long-running analysis lease while the provider is still working", async () => {
    vi.useFakeTimers();
    try {
      state.findMeal.mockResolvedValue(textMeal("Trois croissants et une banane"));
      vi.mocked(claimCloudflareLockWithToken).mockResolvedValue("analysis-lease-token");
      vi.mocked(refreshCloudflareLockWithToken).mockResolvedValue(true);
      state.touchMealAnalysis.mockResolvedValue(true);
      let resolveAnalysis!: (value: typeof textOnlyAnalysis) => void;
      const analyzeText = vi.fn().mockReturnValue(new Promise<typeof textOnlyAnalysis>((resolve) => { resolveAnalysis = resolve; }));

      const pending = analyzeMeal("user-1", baseId, { provider: { name: "stub", model: "stub-1", analyze: vi.fn(), analyzeText } });
      await vi.waitFor(() => expect(analyzeText).toHaveBeenCalledTimes(1), { interval: 1, timeout: 1_000 });
      await vi.advanceTimersByTimeAsync(30_000);

      expect(refreshCloudflareLockWithToken).toHaveBeenCalledWith(`meal-analysis:user-1:${baseId}`, "user-1", "analysis-lease-token", 120_000);
      expect(touchMealAnalysis).toHaveBeenCalledWith("user-1", expect.any(String));
      resolveAnalysis(textOnlyAnalysis);
      await pending;
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns the completed result for a repeated analysis request id", async () => {
    state.findMeal.mockResolvedValue({ id: baseId, userId: "user-1", mealDate: "2026-08-31", mealType: "snack" as const, note: "2 bananes", status: "draft" as const, mouthWarmthIntensity: null, stomachOverfullIntensity: null, createdAt: "2026-08-31T10:00:00.000Z", updatedAt: "2026-08-31T10:00:00.000Z", photos: [], analysis: null });
    const analyzeText = vi.fn().mockResolvedValue(textOnlyAnalysis);
    const provider = { name: "stub", model: "stub-1", analyze: vi.fn(), analyzeText };

    await analyzeMeal("user-1", baseId, { provider, analysisRequestId: "analysis-request-1" });
    state.findMealAnalysisByRequestId.mockResolvedValue({ id: "analysis-requested", mealId: baseId, status: "completed", provider: "stub", model: "stub-1", result: textOnlyAnalysis, error: null, sourcePhotoIds: [], createdAt: "2026-08-31T10:01:00.000Z", completedAt: "2026-08-31T10:01:01.000Z" });

    const repeated = await analyzeMeal("user-1", baseId, { provider, force: true, analysisRequestId: "analysis-request-1" });

    expect(repeated).toMatchObject({ fresh: false, analysis: { id: "analysis-requested", result: textOnlyAnalysis } });
    expect(analyzeText).toHaveBeenCalledTimes(1);
  });

  it("analyses an image-only meal with one vision call", async () => {
    const photo = { id: "photo-1", mealId: baseId, origin: "homemade" as const, comment: "Plat principal", objectPath: "private/photo-1", mimeType: "image/jpeg" as const, bytes: 3, createdAt: "2026-08-31T10:00:00.000Z", storageStatus: "available" as const };
    state.findMeal.mockResolvedValue({ id: baseId, userId: "user-1", mealDate: "2026-08-31", mealType: "lunch" as const, note: null, status: "draft" as const, mouthWarmthIntensity: null, stomachOverfullIntensity: null, createdAt: "2026-08-31T10:00:00.000Z", updatedAt: "2026-08-31T10:00:00.000Z", photos: [photo], analysis: null });
    vi.mocked(getR2MealPhotoObject).mockResolvedValue(new Response(Uint8Array.from([1, 2, 3])));
    const analyze = vi.fn().mockResolvedValue(textOnlyAnalysis);
    const analyzeText = vi.fn().mockResolvedValue(textOnlyAnalysis);

    await analyzeMeal("user-1", baseId, { provider: { name: "stub", model: "stub-1", analyze, analyzeText } });

    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze).toHaveBeenCalledWith({ mealType: "lunch", mealDate: "2026-08-31", note: null, images: [{ id: photo.id, mimeType: photo.mimeType, origin: photo.origin, comment: "Plat principal", data: expect.any(ArrayBuffer) }] });
    expect(analyzeText).not.toHaveBeenCalled();
  });

  it("sends a note and four photos together in one vision call", async () => {
    const photos = [
      { id: "photo-1", mealId: baseId, origin: "homemade" as const, objectPath: "private/photo-1", mimeType: "image/jpeg" as const, bytes: 3, createdAt: "2026-08-31T10:00:00.000Z", storageStatus: "available" as const },
      { id: "photo-2", mealId: baseId, origin: "homemade" as const, objectPath: "private/photo-2", mimeType: "image/png" as const, bytes: 3, createdAt: "2026-08-31T10:00:01.000Z", storageStatus: "available" as const },
      { id: "photo-3", mealId: baseId, origin: "homemade" as const, objectPath: "private/photo-3", mimeType: "image/jpeg" as const, bytes: 3, createdAt: "2026-08-31T10:00:02.000Z", storageStatus: "available" as const },
      { id: "photo-4", mealId: baseId, origin: "homemade" as const, objectPath: "private/photo-4", mimeType: "image/png" as const, bytes: 3, createdAt: "2026-08-31T10:00:03.000Z", storageStatus: "available" as const },
    ];
    state.findMeal.mockResolvedValue({ id: baseId, userId: "user-1", mealDate: "2026-08-31", mealType: "lunch" as const, note: "Pâtes avec sauce tomate", status: "draft" as const, mouthWarmthIntensity: null, stomachOverfullIntensity: null, createdAt: "2026-08-31T10:00:00.000Z", updatedAt: "2026-08-31T10:00:00.000Z", photos, analysis: null });
    vi.mocked(getR2MealPhotoObject)
      .mockResolvedValueOnce(new Response(Uint8Array.from([1, 2, 3])))
      .mockResolvedValueOnce(new Response(Uint8Array.from([4, 5, 6])))
      .mockResolvedValueOnce(new Response(Uint8Array.from([7, 8, 9])))
      .mockResolvedValueOnce(new Response(Uint8Array.from([10, 11, 12])));
    const analyze = vi.fn().mockResolvedValue(textOnlyAnalysis);
    const analyzeText = vi.fn().mockResolvedValue(textOnlyAnalysis);

    await analyzeMeal("user-1", baseId, { provider: { name: "stub", model: "stub-1", analyze, analyzeText } });

    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze).toHaveBeenCalledWith({ mealType: "lunch", mealDate: "2026-08-31", note: "Pâtes avec sauce tomate", images: [
      { id: "photo-1", mimeType: "image/jpeg", origin: "homemade", comment: null, data: expect.any(ArrayBuffer) },
      { id: "photo-2", mimeType: "image/png", origin: "homemade", comment: null, data: expect.any(ArrayBuffer) },
      { id: "photo-3", mimeType: "image/jpeg", origin: "homemade", comment: null, data: expect.any(ArrayBuffer) },
      { id: "photo-4", mimeType: "image/png", origin: "homemade", comment: null, data: expect.any(ArrayBuffer) },
    ] });
    expect(analyzeText).not.toHaveBeenCalled();
  });

  it("sends six photos together in one vision call", async () => {
    const photos = Array.from({ length: 6 }, (_, index) => ({
      id: `photo-${index + 1}`,
      mealId: baseId,
      origin: "homemade" as const,
      objectPath: `private/photo-${index + 1}`,
      mimeType: index % 2 === 0 ? "image/jpeg" as const : "image/png" as const,
      bytes: 3,
      createdAt: `2026-08-31T10:00:0${index}.000Z`,
      storageStatus: "available" as const,
    }));
    state.findMeal.mockResolvedValue({ id: baseId, userId: "user-1", mealDate: "2026-08-31", mealType: "lunch" as const, note: "Six vues du repas", status: "draft" as const, mouthWarmthIntensity: null, stomachOverfullIntensity: null, createdAt: "2026-08-31T10:00:00.000Z", updatedAt: "2026-08-31T10:00:00.000Z", photos, analysis: null });
    for (let index = 0; index < 6; index += 1) vi.mocked(getR2MealPhotoObject).mockResolvedValueOnce(new Response(Uint8Array.from([index + 1])));
    const analyze = vi.fn().mockResolvedValue(textOnlyAnalysis);

    await analyzeMeal("user-1", baseId, { provider: { name: "stub", model: "stub-1", analyze } });

    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze.mock.calls[0]?.[0].images).toHaveLength(6);
  });

  it("rejects seven photos before writing any file", async () => {
    const currentMeal = { id: baseId, userId: "user-1", mealDate: "2026-08-31", mealType: "lunch" as const, note: null, status: "draft" as const, mouthWarmthIntensity: null, stomachOverfullIntensity: null, createdAt: "2026-08-31T10:00:00.000Z", updatedAt: "2026-08-31T10:00:00.000Z", photos: [], analysis: null };
    state.findMeal.mockResolvedValue(currentMeal);
    const files = Array.from({ length: 7 }, (_, index) => ({ filename: `photo-${index}.jpg`, mimeType: "image/jpeg" as const, size: 1, data: new Uint8Array([index]).buffer, origin: "unknown" as const }));

    await expect(addMealPhotos("user-1", baseId, files)).rejects.toMatchObject({ code: "invalid", message: "A meal can contain at most 6 photos." });
  });

  it("rejects analysis without photo and without note", async () => {
    state.findMeal.mockResolvedValue({ id: baseId, userId: "user-1", mealDate: "2026-08-31", mealType: "lunch" as const, note: null, status: "draft" as const, mouthWarmthIntensity: null, stomachOverfullIntensity: null, createdAt: "2026-08-31T10:00:00.000Z", updatedAt: "2026-08-31T10:00:00.000Z", photos: [], analysis: null });
    await expect(analyzeMeal("user-1", baseId, { provider: { name: "stub", model: "stub-1", analyze: vi.fn() } })).rejects.toMatchObject({ code: "invalid", message: "Ajoute une photo ou une courte description avant l'analyse." });
  });
});
