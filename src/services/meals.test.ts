import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  findMeal: vi.fn(),
  findMealForSlot: vi.fn(),
  insertMeal: vi.fn(),
  insertMealAnalysis: vi.fn(),
  listMeals: vi.fn(),
  updateMeal: vi.fn(),
  updatePhotoOrigin: vi.fn(),
  upsertMealFeelings: vi.fn(),
}));

vi.mock("@/repositories/meals", () => ({
  deleteMeal: vi.fn(), deletePhoto: vi.fn(), findLatestMealAnalysis: vi.fn(), findMeal: state.findMeal, findMealByIdempotencyKey: vi.fn(), findMealForSlot: state.findMealForSlot, findMealPhoto: vi.fn(), findPhotosByUploadIdempotencyKey: vi.fn(), insertMeal: state.insertMeal, insertMealAnalysis: state.insertMealAnalysis, insertPhoto: vi.fn(), listMealPhotos: vi.fn(), listMeals: state.listMeals, updateMeal: state.updateMeal, updateMealAnalysis: vi.fn(), updatePhotoOrigin: state.updatePhotoOrigin, upsertMealFeelings: state.upsertMealFeelings,
}));
vi.mock("@/lib/cloudflare/db", () => ({ claimCloudflareLock: vi.fn(), releaseCloudflareLock: vi.fn() }));
vi.mock("@/lib/r2", () => ({ deleteR2MealPhotoObject: vi.fn(), getR2MealPhotoObject: vi.fn(), mealPhotoObjectPath: vi.fn(), putR2MealPhotoObject: vi.fn() }));

import { createMeal, loadConfirmedMealRecords, updateMealPhotoOrigin, updateMealRecord } from "./meals";

const canonicalCorrection = {
  summary: "Correction utilisateur",
  foods: [],
  totals: { calories: { low: 500, likely: 600, high: 700 }, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null },
  confidence: "medium" as const,
  uncertainties: [],
};

describe("meal analysis provenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const meal = { id: "12345678-1234-1234-1234-123456789012", userId: "user-1", mealDate: "2026-08-31", mealType: "lunch" as const, note: null, status: "draft" as const, mouthWarmthIntensity: null, stomachOverfullIntensity: null, createdAt: "2026-08-31T10:00:00.000Z", updatedAt: "2026-08-31T10:00:00.000Z", photos: [{ id: "photo-1", mealId: "12345678-1234-1234-1234-123456789012", origin: "homemade" as const, objectPath: "private/photo", mimeType: "image/jpeg" as const, bytes: 10, createdAt: "2026-08-31T10:00:00.000Z" }], analysis: { id: "analysis-xai", mealId: "12345678-1234-1234-1234-123456789012", status: "completed" as const, provider: "xai", model: "grok-4.6", result: null, error: null, sourcePhotoIds: ["photo-1"], createdAt: "2026-08-31T10:01:00.000Z", completedAt: "2026-08-31T10:01:01.000Z" } };
    state.findMeal.mockResolvedValue(meal);
    state.findMealForSlot.mockResolvedValue(null);
    state.insertMealAnalysis.mockResolvedValue({ ...meal.analysis, id: "analysis-user", provider: "user", model: "confirmed-v1", result: canonicalCorrection });
  });

  it("stores a user correction as a new analysis without replacing the Grok run", async () => {
    await updateMealRecord("user-1", "12345678-1234-1234-1234-123456789012", { status: "confirmed", confirmedAnalysis: canonicalCorrection });
    expect(state.insertMealAnalysis).toHaveBeenCalledWith(expect.objectContaining({ provider: "user", model: "confirmed-v1", status: "completed", result: canonicalCorrection, source_photo_ids: ["photo-1"] }));
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

  it("updates a photo origin and returns not-found from the repository", async () => {
    const photoId = "abcdef12-1234-1234-1234-123456789012";
    state.updatePhotoOrigin.mockResolvedValue({ id: photoId, mealId: "12345678-1234-1234-1234-123456789012", origin: "prepared", objectPath: "private/photo", mimeType: "image/jpeg", bytes: 10, createdAt: "2026-08-31T10:00:00.000Z" });
    await updateMealPhotoOrigin("user-1", "12345678-1234-1234-1234-123456789012", photoId, "prepared");
    expect(state.updatePhotoOrigin).toHaveBeenCalledWith("user-1", "12345678-1234-1234-1234-123456789012", photoId, "prepared");
    expect(state.updateMeal).toHaveBeenCalledWith("user-1", "12345678-1234-1234-1234-123456789012", { status: "draft" });
  });
});
