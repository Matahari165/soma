import { afterEach, describe, expect, it } from "vitest";

import { POST as createMeal, GET as listMeals, PUT as saveMeal } from "./route";
import { PATCH as patchMeal } from "./[id]/route";
import { POST as uploadPhotos } from "./[id]/photos/route";
import { POST as analyzeMeal } from "./[id]/analyze/route";
import { DELETE as deletePhoto, GET as getPhoto, PATCH as patchPhoto } from "./[id]/photos/[photoId]/route";
import { POST as legacyAnalyzeMeal } from "./analyze/route";

describe("meal API local preview flow", () => {
  afterEach(() => {
    delete process.env.SOMA_LOCAL_PREVIEW;
  });

  it("creates a skipped entry without a note, nutrition or AI analysis", async () => {
    process.env.SOMA_LOCAL_PREVIEW = "true";
    const created = await createMeal(new Request("https://soma.example/api/meals", { method: "POST", body: JSON.stringify({ mealDate: "2026-09-10", mealType: "lunch", entryState: "skipped" }), headers: { "content-type": "application/json" } }));
    expect(created.status).toBe(201);
    const body = await created.json() as { meal: { id: string; entryState: string; note: string | null; analysis: unknown; photos: unknown[] } };
    expect(body.meal).toMatchObject({ entryState: "skipped", note: null, analysis: null, photos: [] });

    const listed = await listMeals(new Request("https://soma.example/api/meals?date=2026-09-10"));
    expect((await listed.json()).meals.lunch).toMatchObject({ id: body.meal.id, entryState: "skipped", analysis: null });
  });

  it("reactivates a skipped entry without losing its note or analysis", async () => {
    process.env.SOMA_LOCAL_PREVIEW = "true";
    const created = await createMeal(new Request("https://soma.example/api/meals", { method: "POST", body: JSON.stringify({ mealDate: "2026-09-11", mealType: "dinner", note: "Pâtes et tomates", entryState: "recorded" }), headers: { "content-type": "application/json" } }));
    const initial = (await created.json()).meal as { id: string };
    const analysed = await analyzeMeal(new Request(`https://soma.example/api/meals/${initial.id}/analyze`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } }), { params: Promise.resolve({ id: initial.id }) });
    expect(analysed.status).toBe(200);
    const analysedMeal = (await analysed.json()).meal as { analysis: { id: string } };

    const skipped = await patchMeal(new Request(`https://soma.example/api/meals/${initial.id}`, { method: "PATCH", body: JSON.stringify({ entryState: "skipped" }), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ id: initial.id }) });
    expect(skipped.status).toBe(200);
    expect((await skipped.json()).meal).toMatchObject({ entryState: "skipped", note: "Pâtes et tomates", analysis: { id: analysedMeal.analysis.id } });

    const reactivated = await patchMeal(new Request(`https://soma.example/api/meals/${initial.id}`, { method: "PATCH", body: JSON.stringify({ entryState: "recorded" }), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ id: initial.id }) });
    expect(reactivated.status).toBe(200);
    expect((await reactivated.json()).meal).toMatchObject({ entryState: "recorded", note: "Pâtes et tomates", analysis: { id: analysedMeal.analysis.id } });
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
    expect(meal.status).toBe("confirmed");
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

  it("rejects confirmation of a photo-only meal until it has been analysed", async () => {
    process.env.SOMA_LOCAL_PREVIEW = "true";
    const created = await createMeal(new Request("https://soma.example/api/meals", { method: "POST", body: JSON.stringify({ mealDate: "2026-09-03", mealType: "snack" }), headers: { "content-type": "application/json" } }));
    const meal = (await created.json()).meal as { id: string };
    const form = new FormData();
    form.append("photos", new File([Uint8Array.from([7, 8, 9])], "snack.jpg", { type: "image/jpeg" }));
    form.append("origin", "homemade");
    const uploaded = await uploadPhotos(new Request(`https://soma.example/api/meals/${meal.id}/photos`, { method: "POST", body: form }), { params: Promise.resolve({ id: meal.id }) });
    const photoId = (await uploaded.json()).photos[0].id as string;

    const response = await patchMeal(new Request(`https://soma.example/api/meals/${meal.id}`, { method: "PATCH", body: JSON.stringify({ status: "confirmed" }), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ id: meal.id }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Analyse les photos avant de confirmer ce repas." });
    const stillAvailable = await getPhoto(new Request(`https://soma.example/api/meals/${meal.id}/photos/${photoId}`), { params: Promise.resolve({ id: meal.id, photoId }) });
    expect(stillAvailable.status).toBe(200);
  });

  it("returns the same purge response as production and ignores purged photos in the legacy origin index", async () => {
    process.env.SOMA_LOCAL_PREVIEW = "true";
    const created = await createMeal(new Request("https://soma.example/api/meals", { method: "POST", body: JSON.stringify({ mealDate: "2026-09-04", mealType: "dinner" }), headers: { "content-type": "application/json" } }));
    const meal = (await created.json()).meal as { id: string };
    const initialForm = new FormData();
    initialForm.append("photos", new File([Uint8Array.from([1, 2, 3])], "dinner.jpg", { type: "image/jpeg" }));
    initialForm.append("origin", "homemade");
    const uploaded = await uploadPhotos(new Request(`https://soma.example/api/meals/${meal.id}/photos`, { method: "POST", body: initialForm }), { params: Promise.resolve({ id: meal.id }) });
    const photoId = (await uploaded.json()).photos[0].id as string;
    await analyzeMeal(new Request(`https://soma.example/api/meals/${meal.id}/analyze`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } }), { params: Promise.resolve({ id: meal.id }) });
    const confirmed = await patchMeal(new Request(`https://soma.example/api/meals/${meal.id}`, { method: "PATCH", body: JSON.stringify({ status: "confirmed" }), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ id: meal.id }) });
    expect(confirmed.status).toBe(200);

    const purged = await getPhoto(new Request(`https://soma.example/api/meals/${meal.id}/photos/${photoId}`), { params: Promise.resolve({ id: meal.id, photoId }) });
    expect(purged.status).toBe(410);
    expect(await purged.json()).toEqual({ error: "Photo supprimée après confirmation, analyse conservée.", code: "photo_purged" });

    const retryForm = new FormData();
    retryForm.set("date", "2026-09-04");
    retryForm.set("slot", "dinner");
    retryForm.set("mealId", meal.id);
    retryForm.set("origins", JSON.stringify(["prepared"]));
    retryForm.append("photos", new File([Uint8Array.from([4, 5, 6])], "dinner-retry.jpg", { type: "image/jpeg" }));
    const retried = await legacyAnalyzeMeal(new Request("https://soma.example/api/meals/analyze", { method: "POST", body: retryForm }));
    expect(retried.status).toBe(200);
    expect((await retried.json()).meal.photos).toHaveLength(2);
  });

  it("rejects a non-ISO date in the legacy save contract", async () => {
    process.env.SOMA_LOCAL_PREVIEW = "true";
    const response = await saveMeal(new Request("https://soma.example/api/meals", { method: "PUT", body: JSON.stringify({ meal: { id: "12345678-1234-1234-1234-123456789012", date: "31/08/2026", slot: "lunch" } }), headers: { "content-type": "application/json" } }));
    expect(response.status).toBe(400);
  });
});
