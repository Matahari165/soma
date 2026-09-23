import { describe, expect, it } from "vitest";

import { createPreviewMeal, addPreviewMealPhotos, analyzePreviewMeal, clearPreviewUserData, deletePreviewMeal, findPreviewMeal, findPreviewPhoto, loadPreviewConfirmedMealRecords, updatePreviewMeal, updatePreviewPhotoOrigin } from "./meal-preview";

describe("local meal preview store", () => {
  it("applies mixed corrections to the matching nutrients without copying the instruction into the summary", () => {
    const userId = `preview-${crypto.randomUUID()}`;
    const meal = createPreviewMeal(userId, { mealDate: "2026-09-12", mealType: "lunch", note: "Riz et légumes" });
    analyzePreviewMeal(userId, meal.id);

    const corrected = analyzePreviewMeal(userId, meal.id, { correction: "Retire 100 kcal mais ajoute 20 g de protéines" });
    expect(corrected?.analysis.result?.totals.calories?.likely).toBe(500);
    expect(corrected?.analysis.result?.totals.proteinGrams?.likely).toBe(48);
    expect(corrected?.analysis.result?.summary).not.toContain("Retire 100 kcal");
    expect(corrected?.analysis.result?.calorieAnalysis).toBeNull();
  });
  it("supports the mobile flow without D1, R2, or xAI", () => {
    const userId = `preview-${crypto.randomUUID()}`;
    const meal = createPreviewMeal(userId, { mealDate: "2026-08-31", mealType: "dinner", note: null, idempotencyKey: "preview-idempotency-1" });
    const retry = createPreviewMeal(userId, { mealDate: "2026-08-31", mealType: "dinner", note: "ignored on retry", idempotencyKey: "preview-idempotency-1" });
    expect(retry.id).toBe(meal.id);
    const photos = addPreviewMealPhotos(userId, meal.id, [
      { mimeType: "image/jpeg", size: 3, data: Uint8Array.from([1, 2, 3]).buffer, origin: "homemade" },
      { mimeType: "image/jpeg", size: 3, data: Uint8Array.from([4, 5, 6]).buffer, origin: "prepared" },
    ]);
    expect(photos).toHaveLength(2);
    expect(new Uint8Array(findPreviewPhoto(userId, meal.id, photos?.[0]?.id ?? "")?.data ?? new ArrayBuffer(0))).toEqual(new Uint8Array([1, 2, 3]));
    const analysis = analyzePreviewMeal(userId, meal.id);
    expect(analysis?.analysis.result?.totals.calories?.likely).toBe(600);
    const confirmed = updatePreviewMeal(userId, meal.id, { status: "confirmed" });
    expect(confirmed?.status).toBe("confirmed");
    expect(findPreviewPhoto(userId, meal.id, photos?.[0]?.id ?? "")).toMatchObject({ storageStatus: "purged", purgedAt: expect.any(String) });
    expect(new Uint8Array(findPreviewPhoto(userId, meal.id, photos?.[0]?.id ?? "")?.data ?? new ArrayBuffer(0))).toEqual(new Uint8Array());
    expect(loadPreviewConfirmedMealRecords(userId)[0]).toMatchObject({ id: meal.id, origin: "mixed", caloriesKcal: { low: 450, likely: 600, high: 800 }, foods: [{ sugarG: null, addedSugarG: null, observation: { portion: "unknown", qualityProperties: "unknown", sugarExposure: "unknown", novaGroup: "unknown" } }] });
    expect(deletePreviewMeal(userId, meal.id)).toBe(true);
    expect(findPreviewMeal(userId, meal.id)).toBeNull();
  });

  it("keeps one preview meal per date and slot and can clear a user", () => {
    const userId = `preview-${crypto.randomUUID()}`;
    const first = createPreviewMeal(userId, { mealDate: "2026-09-01", mealType: "breakfast", note: null });
    const duplicate = createPreviewMeal(userId, { mealDate: "2026-09-01", mealType: "breakfast", note: "ignored" });
    expect(duplicate.id).toBe(first.id);
    const photos = addPreviewMealPhotos(userId, first.id, [{ mimeType: "image/jpeg", size: 1, data: Uint8Array.from([1]).buffer, origin: "homemade" }]);
    expect(updatePreviewPhotoOrigin(userId, first.id, photos?.[0]?.id ?? "", "prepared")?.origin).toBe("prepared");
    expect(clearPreviewUserData(userId)).toBe(1);
    expect(findPreviewMeal(userId, first.id)).toBeNull();
  });

  it("keeps a confirmed text-only meal origin unknown", () => {
    const userId = `preview-${crypto.randomUUID()}`;
    const meal = createPreviewMeal(userId, { mealDate: "2026-09-02", mealType: "snack", note: "Une pomme", idempotencyKey: "preview-text-only-1" });
    expect(analyzePreviewMeal(userId, meal.id)?.analysis.sourcePhotoIds).toEqual([]);
    expect(updatePreviewMeal(userId, meal.id, { status: "confirmed" })?.status).toBe("confirmed");
    expect(loadPreviewConfirmedMealRecords(userId)[0]).toMatchObject({ id: meal.id, origin: "unknown" });
  });

  it("keeps a confirmed meal occurrence when no analysis was completed", () => {
    const userId = `preview-${crypto.randomUUID()}`;
    const meal = createPreviewMeal(userId, { mealDate: "2026-09-06", mealType: "lunch", note: "Repas noté" });
    expect(updatePreviewMeal(userId, meal.id, { status: "confirmed" })?.status).toBe("confirmed");

    const records = loadPreviewConfirmedMealRecords(userId);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: meal.id, caloriesKcal: null, proteinG: null, carbsG: null, fatG: null, fiberG: null });
    expect(records[0]?.foods).toBeUndefined();
  });

  it("keeps an explicit skipped slot out of analysis and scoring until reactivated", () => {
    const userId = `preview-${crypto.randomUUID()}`;
    const meal = createPreviewMeal(userId, { mealDate: "2026-09-07", mealType: "breakfast", note: "Petit déjeuner conservé", entryState: "skipped" });

    expect(meal).toMatchObject({ entryState: "skipped", status: "draft", note: "Petit déjeuner conservé", analysis: null });
    expect(() => analyzePreviewMeal(userId, meal.id)).toThrow("Réactive ce créneau");
    expect(loadPreviewConfirmedMealRecords(userId)).toEqual([]);

    const reactivated = updatePreviewMeal(userId, meal.id, { entryState: "recorded" });
    expect(reactivated).toMatchObject({ entryState: "recorded", note: "Petit déjeuner conservé", analysis: null });
  });

  it("combines the note and available photos in one preview analysis", () => {
    const userId = `preview-${crypto.randomUUID()}`;
    const meal = createPreviewMeal(userId, { mealDate: "2026-09-04", mealType: "lunch", note: "Pâtes avec sauce tomate" });
    const photos = addPreviewMealPhotos(userId, meal.id, [
      { mimeType: "image/jpeg", size: 1, data: Uint8Array.from([1]).buffer, origin: "homemade" },
      { mimeType: "image/jpeg", size: 1, data: Uint8Array.from([2]).buffer, origin: "prepared" },
    ]);

    const result = analyzePreviewMeal(userId, meal.id);

    expect(result?.analysis.result?.summary).toContain("photos et description");
    expect(result?.analysis.sourcePhotoIds).toEqual(photos?.map((photo) => photo.id));
  });

  it("does not reuse purged photos when a text-only preview is analysed again", () => {
    const userId = `preview-${crypto.randomUUID()}`;
    const meal = createPreviewMeal(userId, { mealDate: "2026-09-05", mealType: "dinner", note: "Une soupe" });
    const photos = addPreviewMealPhotos(userId, meal.id, [{ mimeType: "image/jpeg", size: 1, data: Uint8Array.from([1]).buffer, origin: "homemade" }]);
    analyzePreviewMeal(userId, meal.id);
    updatePreviewMeal(userId, meal.id, { status: "confirmed" });

    const result = analyzePreviewMeal(userId, meal.id);

    expect(result?.analysis.result?.summary).toContain("description saisie");
    expect(result?.analysis.sourcePhotoIds).toEqual([]);
    expect(findPreviewPhoto(userId, meal.id, photos?.[0]?.id ?? "")).toMatchObject({ storageStatus: "purged" });
  });

  it("refuses to purge preview photos before analysis", () => {
    const userId = `preview-${crypto.randomUUID()}`;
    const meal = createPreviewMeal(userId, { mealDate: "2026-09-03", mealType: "lunch", note: null });
    const photos = addPreviewMealPhotos(userId, meal.id, [{ mimeType: "image/jpeg", size: 3, data: Uint8Array.from([1, 2, 3]).buffer, origin: "homemade" }]);

    expect(() => updatePreviewMeal(userId, meal.id, { status: "confirmed" })).toThrow("Analyse les photos avant de confirmer ce repas.");
    expect(findPreviewPhoto(userId, meal.id, photos?.[0]?.id ?? "")).toMatchObject({ storageStatus: "available", bytes: 3 });
    expect(new Uint8Array(findPreviewPhoto(userId, meal.id, photos?.[0]?.id ?? "")?.data ?? new ArrayBuffer(0))).toEqual(new Uint8Array([1, 2, 3]));
  });
});
