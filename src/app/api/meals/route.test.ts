import { afterEach, describe, expect, it } from "vitest";

import { POST as createMeal, GET as listMeals, PUT as saveMeal } from "./route";
import { PATCH as patchMeal } from "./[id]/route";
import { POST as uploadPhotos } from "./[id]/photos/route";
import { POST as analyzeMeal } from "./[id]/analyze/route";
import { DELETE as deletePhoto, PATCH as patchPhoto } from "./[id]/photos/[photoId]/route";
import { POST as legacyAnalyzeMeal } from "./analyze/route";

describe("meal API local preview flow", () => {
  afterEach(() => {
    delete process.env.SOMA_LOCAL_PREVIEW;
  });

  it("creates, uploads, analyses and confirms a meal on an iPhone-like request", async () => {
    process.env.SOMA_LOCAL_PREVIEW = "true";
    const created = await createMeal(new Request("https://soma.example/api/meals", { method: "POST", body: JSON.stringify({ mealDate: "2026-08-31", mealType: "lunch", idempotencyKey: "route-preview-idempotency" }), headers: { "content-type": "application/json" } }));
    expect(created.status).toBe(201);
    const meal = (await created.json()).meal as { id: string };
    const form = new FormData();
    form.append("photos", new File([Uint8Array.from([1, 2, 3])], "lunch.jpg", { type: "image/jpeg" }));
    form.append("origin", "prepared");
    const uploaded = await uploadPhotos(new Request(`https://soma.example/api/meals/${meal.id}/photos`, { method: "POST", body: form }), { params: Promise.resolve({ id: meal.id }) });
    expect(uploaded.status).toBe(201);
    const analysed = await analyzeMeal(new Request(`https://soma.example/api/meals/${meal.id}/analyze`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } }), { params: Promise.resolve({ id: meal.id }) });
    expect(analysed.status).toBe(200);
    expect((await analysed.json()).analysis.result.totals.proteinGrams.likely).toBe(28);
    const updated = await patchMeal(new Request(`https://soma.example/api/meals/${meal.id}`, { method: "PATCH", body: JSON.stringify({ status: "confirmed", mouthWarmthIntensity: 3, stomachOverfullIntensity: "none" }), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ id: meal.id }) });
    expect(updated.status).toBe(200);
    const listed = await listMeals(new Request("https://soma.example/api/meals?from=2026-08-31&to=2026-08-31"));
    expect((await listed.json()).meals[0]).toMatchObject({ id: meal.id, status: "confirmed", mouthWarmthIntensity: 3, stomachOverfullIntensity: 0, photos: [{ origin: "prepared" }] });
  });

  it("keeps the existing date/slot multipart client contract working", async () => {
    process.env.SOMA_LOCAL_PREVIEW = "true";
    const form = new FormData();
    form.set("date", "2026-09-01");
    form.set("slot", "breakfast");
    form.set("mealId", `client-${crypto.randomUUID()}`);
    form.set("origins", JSON.stringify(["homemade"]));
    form.append("photos", new File([Uint8Array.from([8, 9])], "breakfast.jpg", { type: "image/jpeg" }));
    const analysed = await legacyAnalyzeMeal(new Request("https://soma.example/api/meals/analyze", { method: "POST", body: form }));
    expect(analysed.status).toBe(200);
    const meal = (await analysed.json()).meal as { id: string; status: string; analysis: { calories: { low: number; high: number } } };
    expect(meal.status).toBe("review");
    const saved = await saveMeal(new Request("https://soma.example/api/meals", { method: "PUT", body: JSON.stringify({ meal: { ...meal, status: "confirmed", mouthHeat: 2, stomachLoad: null } }), headers: { "content-type": "application/json" } }));
    expect(saved.status).toBe(200);
    const loaded = await listMeals(new Request("https://soma.example/api/meals?date=2026-09-01"));
    expect((await loaded.json()).meals.breakfast).toMatchObject({ id: meal.id, status: "confirmed" });
  });

  it("updates the origin of an uploaded photo", async () => {
    process.env.SOMA_LOCAL_PREVIEW = "true";
    const created = await createMeal(new Request("https://soma.example/api/meals", { method: "POST", body: JSON.stringify({ mealDate: "2026-09-02", mealType: "dinner" }), headers: { "content-type": "application/json" } }));
    const meal = (await created.json()).meal as { id: string };
    const form = new FormData();
    form.append("photos", new File([Uint8Array.from([1, 2, 3])], "dinner.jpg", { type: "image/jpeg" }));
    form.append("origin", "homemade");
    const uploaded = await uploadPhotos(new Request(`https://soma.example/api/meals/${meal.id}/photos`, { method: "POST", body: form }), { params: Promise.resolve({ id: meal.id }) });
    const photo = (await uploaded.json()).photos[0] as { id: string };
    const patched = await patchPhoto(new Request(`https://soma.example/api/meals/${meal.id}/photos/${photo.id}`, { method: "PATCH", body: JSON.stringify({ origin: "prepared" }), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ id: meal.id, photoId: photo.id }) });
    expect(patched.status).toBe(200);
    expect((await patched.json()).photo.origin).toBe("prepared");
  });

  it("deletes an uploaded photo", async () => {
    process.env.SOMA_LOCAL_PREVIEW = "true";
    const created = await createMeal(new Request("https://soma.example/api/meals", { method: "POST", body: JSON.stringify({ mealDate: "2026-09-03", mealType: "breakfast" }), headers: { "content-type": "application/json" } }));
    const meal = (await created.json()).meal as { id: string };
    const form = new FormData();
    form.append("photos", new File([Uint8Array.from([4, 5, 6])], "breakfast.jpg", { type: "image/jpeg" }));
    form.append("origin", "homemade");
    const uploaded = await uploadPhotos(new Request(`https://soma.example/api/meals/${meal.id}/photos`, { method: "POST", body: form }), { params: Promise.resolve({ id: meal.id }) });
    const photo = (await uploaded.json()).photos[0] as { id: string };

    const deleted = await deletePhoto(new Request(`https://soma.example/api/meals/${meal.id}/photos/${photo.id}`, { method: "DELETE" }), { params: Promise.resolve({ id: meal.id, photoId: photo.id }) });
    expect(deleted.status).toBe(200);
    const listed = await listMeals(new Request("https://soma.example/api/meals?from=2026-09-03&to=2026-09-03"));
    expect((await listed.json()).meals[0].photos).toEqual([]);
  });

  it("rejects a non-ISO date in the legacy save contract", async () => {
    process.env.SOMA_LOCAL_PREVIEW = "true";
    const response = await saveMeal(new Request("https://soma.example/api/meals", { method: "PUT", body: JSON.stringify({ meal: { id: "12345678-1234-1234-1234-123456789012", date: "31/08/2026", slot: "lunch" } }), headers: { "content-type": "application/json" } }));
    expect(response.status).toBe(400);
  });
});
