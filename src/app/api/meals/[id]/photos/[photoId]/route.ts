import { NextResponse } from "next/server";

import { mealOriginSchema } from "@/domain/meals";
import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { getR2MealPhotoObject } from "@/lib/r2";
import { findPreviewPhoto, removePreviewPhoto, updatePreviewPhotoOrigin } from "@/services/meal-preview";
import { findMealPhoto, MealServiceError, removeMealPhoto, updateMealPhotoOrigin } from "@/services/meals";

export async function GET(_request: Request, context: { params: Promise<{ id: string; photoId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id, photoId } = await context.params;
  if (isLocalPreviewMode()) {
    const photo = findPreviewPhoto(user.id, id, photoId);
    if (!photo) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    return new Response(photo.data, { headers: { "Content-Type": photo.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  }
  try {
    const photo = await findMealPhoto(user.id, id, photoId);
    if (!photo) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    const object = await getR2MealPhotoObject(photo.objectPath);
    if (!object?.body) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    return new Response(object.body, { headers: { "Content-Type": photo.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    if (error instanceof MealServiceError) return NextResponse.json({ error: error.message }, { status: error.code === "not_found" ? 404 : 500 });
    return NextResponse.json({ error: "Photo could not be loaded." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string; photoId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id, photoId } = await context.params;
  if (isLocalPreviewMode()) return removePreviewPhoto(user.id, id, photoId) ? NextResponse.json({ ok: true, preview: true }) : NextResponse.json({ error: "Photo not found." }, { status: 404 });
  try {
    await removeMealPhoto(user.id, id, photoId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof MealServiceError) return NextResponse.json({ error: error.message }, { status: error.code === "not_found" ? 404 : 400 });
    return NextResponse.json({ error: "Photo could not be deleted." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string; photoId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = mealOriginSchema.safeParse((await request.json().catch(() => null) as { origin?: unknown } | null)?.origin);
  if (!parsed.success) return NextResponse.json({ error: "Choose homemade, prepared / bought, or mixed for this photo." }, { status: 400 });
  const { id, photoId } = await context.params;
  if (isLocalPreviewMode()) {
    const photo = updatePreviewPhotoOrigin(user.id, id, photoId, parsed.data);
    return photo ? NextResponse.json({ photo, preview: true }) : NextResponse.json({ error: "Photo not found." }, { status: 404 });
  }
  try {
    const photo = await updateMealPhotoOrigin(user.id, id, photoId, parsed.data);
    return NextResponse.json({ photo });
  } catch (error) {
    if (error instanceof MealServiceError) {
      const status = error.code === "not_found" ? 404 : error.code === "invalid" ? 400 : 503;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: "Photo origin could not be updated." }, { status: 500 });
  }
}
