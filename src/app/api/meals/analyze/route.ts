import { NextResponse } from "next/server";
import { z } from "zod";

import { allowedMealPhotoMimeTypes, mealOriginSchema, mealTypeSchema } from "@/domain/meals";
import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { mealToLegacyApi } from "@/services/meal-api";
import { MealMultipartError, parseMealMultipart } from "@/services/meal-multipart";
import { addPreviewMealPhotos, analyzePreviewMeal, createPreviewMeal, findPreviewMeal, updatePreviewMeal } from "@/services/meal-preview";
import { addMealPhotos, analyzeMeal, createMeal, findMeal, MealServiceError, updateMealPhotoOrigins, updateMealRecord } from "@/services/meals";

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

function errorResponse(error: unknown) {
  if (error instanceof MealServiceError) {
    const status = error.code === "not_found" ? 404 : error.code === "invalid" ? 400 : error.code === "conflict" ? 409 : 503;
    return NextResponse.json({ error: error.message, code: error.diagnosticCode ?? error.code }, { status });
  }
  return NextResponse.json({ error: "Meal analysis is temporarily unavailable." }, { status: 503 });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  let form: FormData;
  try {
    form = await parseMealMultipart(request);
  } catch (error) {
    if (error instanceof MealMultipartError) return NextResponse.json({ error: error.message }, { status: error.code === "too_large" ? 413 : 400 });
    return NextResponse.json({ error: "Send the meal photos as multipart form data." }, { status: 400 });
  }
  const mealId = form.get("mealId");
  const mealDate = form.get("date");
  const mealType = form.get("slot");
  const parsedDate = z.iso.date().safeParse(mealDate);
  const parsedType = mealTypeSchema.safeParse(mealType);
  if (typeof mealId !== "string" || !mealId || !parsedDate.success || !parsedType.success) return NextResponse.json({ error: "The meal date, slot, and id are invalid." }, { status: 400 });
  const files = formFiles(form);
  if (files.some((file) => !allowedMealPhotoMimeTypes.has(file.type))) return NextResponse.json({ error: "Only JPEG, PNG, WebP, GIF, HEIC, and HEIF photos are supported." }, { status: 400 });
  const rawOrigins = parseJsonArray(form.get("origins"));
  const origins = rawOrigins.map((value) => mealOriginSchema.safeParse(value).success ? mealOriginSchema.parse(value) : null);
  if (origins.some((origin) => !origin)) return NextResponse.json({ error: "Choose an origin for every photo." }, { status: 400 });
  const retainedUrls = parseJsonArray(form.get("photoUrls"));

  try {
    if (isLocalPreviewMode()) {
      let meal = findPreviewMeal(user.id, mealId);
      if (!meal) meal = createPreviewMeal(user.id, { mealDate: parsedDate.data, mealType: parsedType.data, note: null, idempotencyKey: `legacy-${mealId}` });
      const existingCount = meal.photos.filter((photo) => photo.storageStatus !== "purged").length;
      const fileOrigins = files.map((_, index) => origins[existingCount + index] ?? (existingCount === 0 ? origins[index] : null));
      if (fileOrigins.some((origin) => !origin)) return NextResponse.json({ error: "Choose an origin for every new photo." }, { status: 400 });
      if (files.length) {
        const added = addPreviewMealPhotos(user.id, meal.id, await Promise.all(files.map(async (file, index) => ({ filename: file.name, mimeType: file.type as Parameters<typeof addPreviewMealPhotos>[2][number]["mimeType"], size: file.size, data: await file.arrayBuffer(), origin: fileOrigins[index] as NonNullable<typeof fileOrigins[number]> }))));
        if (!added) return NextResponse.json({ error: "Meal not found." }, { status: 404 });
      }
      const updated = updatePreviewMeal(user.id, meal.id, { mealDate: parsedDate.data, mealType: parsedType.data });
      const analysed = analyzePreviewMeal(user.id, meal.id);
      const finalMeal = findPreviewMeal(user.id, meal.id);
      return NextResponse.json({ meal: mealToLegacyApi(finalMeal ?? updated ?? meal), analysis: analysed?.analysis, preview: true });
    }

    let meal = await findMeal(user.id, mealId);
    if (!meal) {
      const created = await createMeal(user.id, { mealDate: parsedDate.data, mealType: parsedType.data, note: null, idempotencyKey: `legacy-${mealId}` });
      meal = created.meal;
    } else {
      meal = await updateMealRecord(user.id, meal.id, { mealDate: parsedDate.data, mealType: parsedType.data });
    }
    const existingCount = meal.photos.filter((photo) => photo.storageStatus !== "purged").length;
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
    const result = await analyzeMeal(user.id, refreshed.id, { force: true });
    const analysedMeal = await findMeal(user.id, refreshed.id);
    return NextResponse.json({ meal: mealToLegacyApi(analysedMeal ?? refreshed), analysis: result.analysis });
  } catch (error) {
    return errorResponse(error);
  }
}
