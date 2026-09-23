import { after, NextResponse } from "next/server";
import { z } from "zod";

import { mealAnalysisPhotoMimeTypes, mealOriginSchema, mealTypeSchema } from "@/domain/meals";
import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { mealToLegacyApi } from "@/services/meal-api";
import { MealMultipartError, parseMealMultipart } from "@/services/meal-multipart";
import { addPreviewMealPhotos, analyzePreviewMeal, createPreviewMeal, findPreviewMeal, updatePreviewMeal } from "@/services/meal-preview";
import { addMealPhotos, enqueueMealAnalysis, createMeal, findMeal, MealServiceError, processNextMealAnalysis, updateMealPhotoOrigins, updateMealRecord } from "@/services/meals";

function formFiles(form: FormData) {
  return form.getAll("photos").filter((value): value is File => typeof File !== "undefined" && value instanceof File);
}

function parseJsonArray(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return [] as unknown[];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as unknown[];
  }
}

function photoIdFromUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const path = new URL(value, "https://soma.local").pathname.split("/").filter(Boolean);
    const photoIndex = path.indexOf("photos");
    return photoIndex >= 0 && path[photoIndex + 1] ? decodeURIComponent(path[photoIndex + 1]) : null;
  } catch {
    return null;
  }
}

function errorResponse(error: unknown, requestId: string) {
  const headers = { "X-Analysis-Request-Id": requestId };
  if (error instanceof MealServiceError) {
    const status = error.code === "not_found" ? 404 : error.code === "invalid" ? 400 : error.code === "conflict" ? 409 : 503;
    return NextResponse.json({ error: error.message, code: error.diagnosticCode ?? error.code, requestId }, { status, headers });
  }
  console.error("[meal-analysis] legacy route failed outside service taxonomy", { stage: "legacy_route", reason: error instanceof Error ? error.name : "unknown" });
  return NextResponse.json({ error: "L’analyse du repas a échoué. Réessaie.", code: "UNKNOWN_ANALYSIS_ERROR", requestId }, { status: 503, headers });
}

function requestId(request: Request) {
  const supplied = request.headers.get("x-analysis-request-id");
  return supplied && /^[a-zA-Z0-9._:-]{8,160}$/.test(supplied) ? supplied : crypto.randomUUID();
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const analysisRequestId = requestId(request);
  let form: FormData;
  try {
    form = await parseMealMultipart(request);
  } catch (error) {
    if (error instanceof MealMultipartError) return NextResponse.json({ error: error.message, code: error.code === "too_large" ? "IMAGE_UPLOAD_FAILED" : "INVALID_MEAL_INPUT", requestId: analysisRequestId }, { status: error.code === "too_large" ? 413 : 400, headers: { "X-Analysis-Request-Id": analysisRequestId } });
    return NextResponse.json({ error: "Send the meal photos as multipart form data.", code: "INVALID_MEAL_INPUT", requestId: analysisRequestId }, { status: 400, headers: { "X-Analysis-Request-Id": analysisRequestId } });
  }
  const mealId = form.get("mealId");
  const mealDate = form.get("date");
  const mealType = form.get("slot");
  const noteValue = form.get("note");
  const note = typeof noteValue === "string" ? noteValue.trim().slice(0, 500) : null;
  const parsedDate = z.iso.date().safeParse(mealDate);
  const parsedType = mealTypeSchema.safeParse(mealType);
  if (typeof mealId !== "string" || !mealId || !parsedDate.success || !parsedType.success) return NextResponse.json({ error: "The meal date, slot, and id are invalid." }, { status: 400 });
  const files = formFiles(form);
  if (!isLocalPreviewMode() && files.some((file) => !mealAnalysisPhotoMimeTypes.has(file.type))) return NextResponse.json({ error: "Les photos doivent être envoyées en JPEG ou PNG. Les photos HEIC, HEIF et WebP doivent être converties avant l’envoi." }, { status: 400 });
  const rawOrigins = parseJsonArray(form.get("origins"));
  const origins = rawOrigins.map((value) => mealOriginSchema.safeParse(value).success ? mealOriginSchema.parse(value) : null);
  if (origins.some((origin) => !origin)) return NextResponse.json({ error: "Choose an origin for every photo." }, { status: 400 });
  const retainedUrls = parseJsonArray(form.get("photoUrls"));

  try {
    if (isLocalPreviewMode()) {
      let meal = findPreviewMeal(user.id, mealId);
      if (!meal) meal = createPreviewMeal(user.id, { mealDate: parsedDate.data, mealType: parsedType.data, note, idempotencyKey: `legacy-${mealId}` });
      const existingCount = meal.photos.filter((photo) => (photo.storageStatus ?? "available") === "available").length;
      const fileOrigins = files.map((_, index) => origins[existingCount + index] ?? (existingCount === 0 ? origins[index] : null));
      if (fileOrigins.some((origin) => !origin)) return NextResponse.json({ error: "Choose an origin for every new photo." }, { status: 400 });
      if (files.length) {
        const added = addPreviewMealPhotos(user.id, meal.id, await Promise.all(files.map(async (file, index) => ({ filename: file.name, mimeType: file.type as Parameters<typeof addPreviewMealPhotos>[2][number]["mimeType"], size: file.size, data: await file.arrayBuffer(), origin: fileOrigins[index] as NonNullable<typeof fileOrigins[number]> }))));
        if (!added) return NextResponse.json({ error: "Meal not found." }, { status: 404 });
      }
      const updated = updatePreviewMeal(user.id, meal.id, { mealDate: parsedDate.data, mealType: parsedType.data, ...(note !== null ? { note } : {}) });
      const analysed = analyzePreviewMeal(user.id, meal.id);
      const finalMeal = findPreviewMeal(user.id, meal.id);
      return NextResponse.json({ meal: mealToLegacyApi(finalMeal ?? updated ?? meal), analysis: analysed?.analysis, preview: true, requestId: analysisRequestId }, { headers: { "X-Analysis-Request-Id": analysisRequestId } });
    }

    let meal = await findMeal(user.id, mealId);
    if (!meal) {
      const created = await createMeal(user.id, { mealDate: parsedDate.data, mealType: parsedType.data, note, idempotencyKey: `legacy-${mealId}` });
      meal = created.meal;
    } else {
      meal = await updateMealRecord(user.id, meal.id, { mealDate: parsedDate.data, mealType: parsedType.data, ...(note !== null ? { note } : {}) });
    }
    const existingCount = meal.photos.filter((photo) => (photo.storageStatus ?? "available") === "available").length;
    const fileOrigins = files.map((_, index) => origins[existingCount + index] ?? (existingCount === 0 ? origins[index] : null));
    if (fileOrigins.some((origin) => !origin)) throw new MealServiceError("invalid", "Choose an origin for every new photo.");
    if (files.length) {
      await addMealPhotos(user.id, meal.id, await Promise.all(files.map(async (file, index) => ({ filename: file.name, mimeType: file.type as Parameters<typeof addMealPhotos>[2][number]["mimeType"], size: file.size, data: await file.arrayBuffer(), origin: fileOrigins[index] as NonNullable<typeof fileOrigins[number]> }))), { idempotencyKey: request.headers.get("Idempotency-Key") ?? `legacy-${mealId}-photos` });
    }
    const refreshed = await findMeal(user.id, meal.id);
    if (!refreshed) throw new MealServiceError("unavailable", "The meal could not be reloaded.");
    const retainedPhotoOrigins = retainedUrls.flatMap((url, index) => {
      const photoId = photoIdFromUrl(url);
      const origin = origins[index];
      return photoId && origin ? [{ photoId, origin }] : [];
    }).filter((item) => refreshed.photos.some((photo) => photo.id === item.photoId));
    if (retainedPhotoOrigins.length) await updateMealPhotoOrigins(user.id, refreshed.id, retainedPhotoOrigins);
    const result = await enqueueMealAnalysis(user.id, refreshed.id, { force: false, analysisRequestId });
    if (result.queued) {
      after(async () => {
        try {
          await processNextMealAnalysis({ userId: user.id, analysisId: result.analysis.id });
        } catch (error) {
          console.error("[meal-analysis] legacy immediate background worker failed", {
            stage: "legacy_immediate_worker",
            reason: error instanceof Error ? error.name : "unknown",
          });
        }
      });
    }
    const analysedMeal = await findMeal(user.id, refreshed.id);
    return NextResponse.json({ meal: mealToLegacyApi(analysedMeal ?? refreshed), analysis: result.analysis, queued: result.queued, requestId: analysisRequestId }, { status: result.queued ? 202 : 200, headers: { "X-Analysis-Request-Id": analysisRequestId } });
  } catch (error) {
    return errorResponse(error, analysisRequestId);
  }
}
