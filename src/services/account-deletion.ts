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
  storage_objects?: Array<{ bucket: string; path: string }>;
  auth_user_ids?: string[];
  status: "pending" | "account_deleted";
};

export type DeleteAccountResult =
  | { ok: true; preview?: true; cleanupPending?: true }
  | { ok: false; error: string; status: 400 | 500 };

type ArchivePath = { object_path: string; storage_backend?: string | null; storage_bucket?: string | null };
type ObjectManifest = Pick<DeletionJob, "object_paths" | "storage_objects" | "auth_user_ids">;

async function supabaseAdminRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin access is unavailable.");
  const response = await fetch(`${url}${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Supabase account cleanup failed (${response.status}).`);
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

async function physicalAccountRows<T>(table: "health_record_archives" | "assistant_attachments", userId: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1_000) {
    const query = new URLSearchParams({ select: columns, user_id: `eq.${userId}`, limit: "1000", offset: String(offset) });
    const page = await supabaseAdminRequest<T[]>(`/rest/v1/${table}?${query}`);
    rows.push(...page);
    if (page.length < 1_000) return rows;
  }
}

async function linkedAuthUserIds(userId: string): Promise<string[]> {
  const admin = createCloudflareAdminClient();
  const [user, identities] = await Promise.all([
    admin.from("soma_users").select("auth_user_id").eq("id", userId).maybeSingle(),
    admin.from("soma_auth_identities").select("auth_user_id").eq("soma_user_id", userId),
  ]);
  if (user.error || identities.error) throw new Error("Linked account identities could not be listed.");
  const ids = [user.data?.auth_user_id, ...(identities.data ?? []).map((row) => row.auth_user_id)];
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)))];
}

async function listAccountObjects(userId: string): Promise<ObjectManifest> {
  const admin = createCloudflareAdminClient();
  const [archives, photos, attachments] = await Promise.all([
    admin.from("health_record_archives").select("object_path,storage_backend,storage_bucket").eq("user_id", userId),
    admin.from("meal_photos").select("object_path").eq("user_id", userId),
    admin.from("assistant_attachments").select("object_path").eq("user_id", userId),
  ]);
  if (archives.error || photos.error || attachments.error) throw new Error("Account files could not be listed.");
  const authUserIds = hasSupabaseRuntime() ? await linkedAuthUserIds(userId) : [];
  const physicalArchives = hasSupabaseRuntime()
    ? (await Promise.all(authUserIds.map((id) => physicalAccountRows<ArchivePath>("health_record_archives", id, "object_path,storage_backend,storage_bucket")))).flat()
    : [];
  const physicalAttachments = hasSupabaseRuntime()
    ? await physicalAccountRows<{ object_path: string }>("assistant_attachments", userId, "object_path")
    : [];
  const allArchives = [...(archives.data ?? []) as ArchivePath[], ...physicalArchives];
  const storageObjects = allArchives.flatMap((row) => {
    if (!hasSupabaseRuntime() || row.storage_backend === "r2" || typeof row.object_path !== "string" || !row.object_path) return [];
    const bucket = row.storage_bucket ?? "health-record-archives";
    if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(bucket)) throw new Error("Invalid archive bucket.");
    return [{ bucket, path: row.object_path }];
  });
  const r2Paths = [
    ...allArchives.filter((row) => !hasSupabaseRuntime() || row.storage_backend === "r2").map((row) => row.object_path),
    ...(photos.data ?? []).map((row) => row.object_path),
    ...(attachments.data ?? []).map((row) => row.object_path),
    ...physicalAttachments.map((row) => row.object_path),
    ...labMatrixCacheObjectKeys(userId),
  ];
  return {
    object_paths: [...new Set(r2Paths.filter((path): path is string => typeof path === "string" && path.length > 0))],
    storage_objects: [...new Map(storageObjects.map((object) => [`${object.bucket}/${object.path}`, object])).values()],
    auth_user_ids: authUserIds,
  };
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
  const byBucket = new Map<string, string[]>();
  for (const object of job.storage_objects ?? []) {
    const paths = byBucket.get(object.bucket) ?? [];
    paths.push(object.path);
    byBucket.set(object.bucket, paths);
  }
  for (const [bucket, paths] of byBucket) {
    for (let offset = 0; offset < paths.length; offset += 1_000) {
      await supabaseAdminRequest(`/storage/v1/object/${encodeURIComponent(bucket)}`, "DELETE", { prefixes: paths.slice(offset, offset + 1_000) });
    }
  }
  for (const authUserId of job.auth_user_ids ?? []) {
    await supabaseAdminRequest(`/rest/v1/health_record_archives?user_id=eq.${encodeURIComponent(authUserId)}`, "DELETE");
    try {
      await supabaseAdminRequest(`/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, "DELETE");
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("(404)")) throw error;
    }
  }
  const removed = await createCloudflareAdminClient().from("account_deletion_jobs").delete().eq("id", job.id);
  if (removed.error) throw new Error("Account cleanup record could not be removed.");
}

export async function reconcileAccountDeletionJobs(limit = 5) {
  const admin = createCloudflareAdminClient();
  const result = await admin.from("account_deletion_jobs").select("id,account_user_id,object_paths,storage_objects,auth_user_ids,status")
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
  let manifest: ObjectManifest;
  try {
    manifest = await listAccountObjects(userId);
  } catch {
    return { ok: false, error: "Account files could not be listed.", status: 500 };
  }

  // The manifest is deliberately not owned by the account row: deleting the
  // account must not erase the retry information for private R2 objects.
  const job: DeletionJob = { id: crypto.randomUUID(), account_user_id: userId, ...manifest, status: "pending" };
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
