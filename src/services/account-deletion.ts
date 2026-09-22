import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { isLocalPreviewMode } from "@/lib/env";
import { deleteLabMatrixCache } from "@/lib/lab-matrix-cache";
import { deleteR2Object } from "@/lib/r2";
import { clearPreviewUserData } from "@/services/meal-preview";
import { clearPreviewMealRecipes } from "@/services/meal-recipes";

export const accountDeletionConfirmation = "DELETE MY SOMA DATA";

export type DeleteAccountResult =
  | { ok: true; preview?: true }
  | { ok: false; error: string; status: 400 | 500 };

export async function deleteAccountData(userId: string, confirmation: unknown): Promise<DeleteAccountResult> {
  if (confirmation !== accountDeletionConfirmation) {
    return { ok: false, error: "Enter the exact confirmation phrase.", status: 400 };
  }

  if (isLocalPreviewMode()) {
    clearPreviewUserData(userId);
    clearPreviewMealRecipes(userId);
    return { ok: true, preview: true };
  }

  const admin = createCloudflareAdminClient();
  await admin.from("audit_events").insert({ user_id: userId, event_type: "account_deletion_requested", resource_type: "account" });
  const [
    { data: archiveRows, error: archiveError },
    { data: mealPhotoRows, error: mealPhotoError },
    { data: assistantAttachmentRows, error: assistantAttachmentError },
  ] = await Promise.all([
    admin.from("health_record_archives").select("object_path").eq("user_id", userId),
    admin.from("meal_photos").select("object_path").eq("user_id", userId),
    admin.from("assistant_attachments").select("object_path").eq("user_id", userId),
  ]);
  if (archiveError || mealPhotoError || assistantAttachmentError) return { ok: false, error: "Account files could not be listed.", status: 500 };

  try {
    await Promise.all([
      ...(archiveRows ?? []).map((row) => deleteR2Object(String(row.object_path))),
      ...(mealPhotoRows ?? []).map((row) => deleteR2Object(String(row.object_path))),
      ...(assistantAttachmentRows ?? []).map((row) => deleteR2Object(String(row.object_path))),
      deleteLabMatrixCache(userId),
    ]);
  } catch {
    return { ok: false, error: "Account files could not be deleted.", status: 500 };
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: "Account deletion could not be completed.", status: 500 };
  return { ok: true };
}
