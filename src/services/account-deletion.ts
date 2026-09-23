import "server-only";

import { createCloudflareAdminClient, cloudflareDb, hasSupabaseRuntime } from "@/lib/cloudflare/db";
import { isLocalPreviewMode } from "@/lib/env";
import { labMatrixCacheObjectKeys } from "@/lib/lab-matrix-cache";
import { deleteR2Object } from "@/lib/r2";
import { clearPreviewUserData } from "@/services/meal-preview";
import { clearPreviewMealRecipes } from "@/services/meal-recipes";

export const accountDeletionConfirmation = "DELETE MY SOMA DATA";

type DeletionJob = {
  id: string;
  account_user_id: string;
  object_paths: string[];
  status: "pending" | "account_deleted";
};

export type DeleteAccountResult =
  | { ok: true; preview?: true; cleanupPending?: true }
  | { ok: false; error: string; status: 400 | 500 };

async function listAccountObjectPaths(userId: string) {
  const admin = createCloudflareAdminClient();
  const [archives, photos, attachments] = await Promise.all([
    admin.from("health_record_archives").select("object_path").eq("user_id", userId),
    admin.from("meal_photos").select("object_path").eq("user_id", userId),
    admin.from("assistant_attachments").select("object_path").eq("user_id", userId),
  ]);
  if (archives.error || photos.error || attachments.error) throw new Error("Account files could not be listed.");
  return [...new Set([
    ...(archives.data ?? []), ...(photos.data ?? []), ...(attachments.data ?? []),
  ].map((row) => row.object_path).filter((path): path is string => typeof path === "string" && path.length > 0)
    .concat(labMatrixCacheObjectKeys(userId)))];
}

async function accountStillExists(userId: string) {
  if (!hasSupabaseRuntime()) {
    const row = await cloudflareDb().prepare("SELECT id FROM soma_users WHERE id = ? LIMIT 1").bind(userId).first<{ id: string }>();
    return Boolean(row);
  }
  const result = await createCloudflareAdminClient().from("soma_users").select("id").eq("id", userId).maybeSingle();
  if (result.error) throw new Error("Account deletion state could not be checked.");
  return Boolean(result.data);
}

async function finishAccountDeletionJob(job: DeletionJob) {
  // Deleting an already absent R2 key is safe. If any deletion fails, keep the
  // complete manifest so the next cron run can retry the remaining objects.
  await Promise.all(job.object_paths.map((path) => deleteR2Object(path)));
  const removed = await createCloudflareAdminClient().from("account_deletion_jobs").delete().eq("id", job.id);
  if (removed.error) throw new Error("Account cleanup record could not be removed.");
}

export async function reconcileAccountDeletionJobs(limit = 5) {
  const admin = createCloudflareAdminClient();
  const result = await admin.from("account_deletion_jobs").select("id,account_user_id,object_paths,status")
    .in("status", ["pending", "account_deleted"]).order("created_at", { ascending: true }).limit(limit);
  if (result.error) throw new Error("Pending account deletions could not be loaded.");
  let completed = 0;
  let failed = 0;
  for (const job of (result.data ?? []) as DeletionJob[]) {
    if (await accountStillExists(job.account_user_id)) continue;
    try {
      await finishAccountDeletionJob(job);
      completed += 1;
    } catch {
      // Keep the durable manifest. A later cron run retries it.
      failed += 1;
    }
  }
  if (failed) throw new Error("Some account objects could not be removed.");
  return completed;
}

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
  let objectPaths: string[];
  try {
    objectPaths = await listAccountObjectPaths(userId);
  } catch {
    return { ok: false, error: "Account files could not be listed.", status: 500 };
  }

  // The manifest is deliberately not owned by the account row: deleting the
  // account must not erase the retry information for private R2 objects.
  const job: DeletionJob = { id: crypto.randomUUID(), account_user_id: userId, object_paths: objectPaths, status: "pending" };
  const saved = await admin.from("account_deletion_jobs").insert({ ...job, user_id: null, created_at: new Date().toISOString() });
  if (saved.error) return { ok: false, error: "Account deletion could not be prepared.", status: 500 };

  const deleted = await admin.auth.admin.deleteUser(userId);
  if (deleted.error) return { ok: false, error: "Account deletion could not be completed.", status: 500 };

  // Once the account is gone, return success even when storage is temporarily
  // unavailable. The cron job will finish cleanup using the saved manifest.
  await admin.from("account_deletion_jobs").update({ status: "account_deleted" }).eq("id", job.id);
  try {
    await finishAccountDeletionJob(job);
    return { ok: true };
  } catch {
    return { ok: true, cleanupPending: true };
  }
}
