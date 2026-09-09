import { NextResponse } from "next/server";

import { mealAnalysisPhotoMimeTypes, MAX_MEAL_PHOTOS, mealOriginSchema } from "@/domain/meals";
import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { addPreviewMealPhotos, findPreviewMeal } from "@/services/meal-preview";
import { MealMultipartError, parseMealMultipart } from "@/services/meal-multipart";
import { addMealPhotos, findMeal, listMealPhotos, MealServiceError } from "@/services/meals";

function filesFromForm(form: FormData) {
  return [...form.getAll("photos"), ...form.getAll("photo")].filter((value): value is File => typeof File !== "undefined" && value instanceof File);
}

function originsFromForm(form: FormData, count: number) {
  const indexed = Array.from({ length: count }, (_, index) => form.get(`origin_${index}`)).map((value) => typeof value === "string" ? value : null);
  const encoded = form.get("origins");
  let parsed: unknown = null;
  if (typeof encoded === "string") {
    try { parsed = JSON.parse(encoded); } catch { parsed = null; }
  }
  const encodedOrigins = Array.isArray(parsed) ? parsed : [];
  const repeated = form.getAll("origin").filter((value): value is string => typeof value === "string");
  return Array.from({ length: count }, (_, index) => {
    const value = indexed[index] ?? encodedOrigins[index] ?? repeated[index] ?? (repeated.length === 1 ? repeated[0] : null);
    const parsedOrigin = mealOriginSchema.safeParse(value);
    return parsedOrigin.success ? parsedOrigin.data : null;
  });
}

function errorResponse(error: unknown) {
  if (!(error instanceof MealServiceError)) {
    console.error("[meal-analysis] photo route failed outside service taxonomy", { stage: "photo_route", reason: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Les photos du repas n’ont pas pu être enregistrées.", code: "IMAGE_UPLOAD_FAILED" }, { status: 503 });
  }
  const status = error.code === "not_found" ? 404 : error.code === "invalid" ? 400 : error.code === "conflict" ? 409 : 503;
  return NextResponse.json({ error: error.message, code: error.diagnosticCode ?? error.code }, { status });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await context.params;
  if (isLocalPreviewMode()) {
    const meal = findPreviewMeal(user.id, id);
    return meal ? NextResponse.json({ photos: meal.photos.map((photo) => ({ id: photo.id, mealId: photo.mealId, origin: photo.origin, mimeType: photo.mimeType, bytes: photo.bytes, filename: photo.filename ?? null, createdAt: photo.createdAt, storageStatus: photo.storageStatus ?? "available", purgedAt: photo.purgedAt ?? null, url: `/api/meals/${encodeURIComponent(id)}/photos/${encodeURIComponent(photo.id)}` })), preview: true }) : NextResponse.json({ error: "Meal not found." }, { status: 404 });
  }
  try {
    const meal = await findMeal(user.id, id);
    if (!meal) return NextResponse.json({ error: "Meal not found." }, { status: 404 });
    return NextResponse.json({ photos: (await listMealPhotos(user.id, id)).map((photo) => ({ id: photo.id, mealId: photo.mealId, origin: photo.origin, mimeType: photo.mimeType, bytes: photo.bytes, createdAt: photo.createdAt, storageStatus: photo.storageStatus ?? "available", purgedAt: photo.purgedAt ?? null, url: `/api/meals/${encodeURIComponent(id)}/photos/${encodeURIComponent(photo.id)}` })) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await context.params;
  let form: FormData;
  try {
    form = await parseMealMultipart(request);
  } catch (error) {
    if (error instanceof MealMultipartError) return NextResponse.json({ error: error.message, code: error.code === "too_large" ? "IMAGE_UPLOAD_FAILED" : "INVALID_MEAL_INPUT" }, { status: error.code === "too_large" ? 413 : 400 });
    return NextResponse.json({ error: "Send the photos as multipart form data.", code: "INVALID_MEAL_INPUT" }, { status: 400 });
  }
  const files = filesFromForm(form);
  if (files.length < 1 || files.length > MAX_MEAL_PHOTOS) return NextResponse.json({ error: `Select between 1 and ${MAX_MEAL_PHOTOS} photos.` }, { status: 400 });
  const origins = originsFromForm(form, files.length);
  if (origins.some((origin) => !origin)) return NextResponse.json({ error: "Choose homemade, prepared / bought, or mixed for every photo." }, { status: 400 });
  if (!isLocalPreviewMode() && files.some((file) => !mealAnalysisPhotoMimeTypes.has(file.type))) return NextResponse.json({ error: "Les photos doivent être envoyées en JPEG ou PNG. Les photos HEIC, HEIF et WebP doivent être converties avant l’envoi." }, { status: 400 });
  if (isLocalPreviewMode()) {
    try {
      const photos = addPreviewMealPhotos(user.id, id, await Promise.all(files.map(async (file, index) => ({ filename: file.name, mimeType: file.type as Parameters<typeof addPreviewMealPhotos>[2][number]["mimeType"], size: file.size, data: await file.arrayBuffer(), origin: origins[index] as NonNullable<typeof origins[number]> }))));
      if (!photos) return NextResponse.json({ error: "Meal not found." }, { status: 404 });
      return NextResponse.json({ photos: photos.map((photo) => ({ id: photo.id, mealId: photo.mealId, origin: photo.origin, mimeType: photo.mimeType, bytes: photo.bytes, filename: photo.filename ?? null, createdAt: photo.createdAt, url: `/api/meals/${encodeURIComponent(id)}/photos/${encodeURIComponent(photo.id)}` })), preview: true }, { status: 201 });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Meal photos could not be saved." }, { status: 400 });
    }
  }
  try {
    const photos = await addMealPhotos(user.id, id, await Promise.all(files.map(async (file, index) => ({ filename: file.name, mimeType: file.type as Parameters<typeof addMealPhotos>[2][number]["mimeType"], size: file.size, data: await file.arrayBuffer(), origin: origins[index] as NonNullable<typeof origins[number]> }))), { idempotencyKey: request.headers.get("Idempotency-Key") ?? undefined });
    return NextResponse.json({ photos: photos.map((photo) => ({ id: photo.id, mealId: photo.mealId, origin: photo.origin, mimeType: photo.mimeType, bytes: photo.bytes, filename: photo.filename ?? null, createdAt: photo.createdAt, url: `/api/meals/${encodeURIComponent(id)}/photos/${encodeURIComponent(photo.id)}` })) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
