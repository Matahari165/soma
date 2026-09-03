import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { cloudflareArchives, createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { isLocalPreviewMode } from "@/lib/env";
import { deleteLabMatrixCache } from "@/lib/lab-matrix-cache";
import { clearPreviewUserData } from "@/services/meal-preview";

const schema = z.object({ confirmation: z.literal("DELETE MY SOMA DATA") });

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the exact confirmation phrase." }, { status: 400 });
  if (isLocalPreviewMode()) {
    clearPreviewUserData(user.id);
    return NextResponse.json({ ok: true, preview: true });
  }
  const admin = createCloudflareAdminClient();
  await admin.from("audit_events").insert({ user_id: user.id, event_type: "account_deletion_requested", resource_type: "account" });
  const [{ data: archiveRows, error: archiveError }, { data: mealPhotoRows, error: mealPhotoError }] = await Promise.all([
    admin.from("health_record_archives").select("object_path").eq("user_id", user.id),
    admin.from("meal_photos").select("object_path").eq("user_id", user.id),
  ]);
  if (archiveError || mealPhotoError) return NextResponse.json({ error: "Account files could not be listed." }, { status: 500 });
  try {
    await Promise.all([
      ...(archiveRows ?? []).map((row) => cloudflareArchives().delete(String(row.object_path))),
      ...(mealPhotoRows ?? []).map((row) => cloudflareArchives().delete(String(row.object_path))),
      deleteLabMatrixCache(user.id),
    ]);
  } catch {
    return NextResponse.json({ error: "Account files could not be deleted." }, { status: 500 });
  }
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: "Account deletion could not be completed." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
