import { describe, expect, it } from "vitest";

import { createPreviewMeal, addPreviewMealPhotos, analyzePreviewMeal, clearPreviewUserData, deletePreviewMeal, findPreviewMeal, findPreviewPhoto, loadPreviewConfirmedMealRecords, updatePreviewMeal, updatePreviewPhotoOrigin } from "./meal-preview";

describe("local meal preview store", () => {
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
    expect(loadPreviewConfirmedMealRecords(userId)[0]).toMatchObject({ id: meal.id, origin: "mixed", caloriesKcal: { low: 450, likely: 600, high: 800 } });
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
});
