import "server-only";

import { cache } from "react";

import type {
  Meal,
  MealAnalysis,
  MealAnalysisRecord,
  MealEntryState,
  MealFeeling,
  MealOrigin,
  MealPhoto,
  MealStatus,
  MealType,
} from "@/domain/meals";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { deleteR2MealPhotoObject } from "@/lib/r2";

type Row = Record<string, unknown>;
type MealRow = Row & {
  id: string;
  user_id: string;
  meal_date: string;
  meal_type: MealType;
  note?: string | null;
  status?: MealStatus;
  entry_state?: MealEntryState;
  mouth_warmth_intensity?: number | null;
  stomach_overfull_intensity?: number | null;
  created_at: string;
  updated_at: string;
};
type PhotoRow = Row & {
  id: string;
  user_id: string;
  meal_id: string;
  origin: MealOrigin;
  object_path: string;
  mime_type: MealPhoto["mimeType"];
  bytes: number;
  created_at: string;
  filename?: string | null;
  comment?: string | null;
  upload_idempotency_key?: string | null;
  storage_status?: MealPhoto["storageStatus"];
  purged_at?: string | null;
};
export type MealPhotoUploadJob = {
  id: string;
  user_id: string;
  meal_id: string;
  photo_id: string;
  object_path: string;
  created_at: string;
};
type AnalysisRow = Row & {
  id: string;
  user_id: string;
  meal_id: string;
  analysis_request_id?: string | null;
  source_revision?: string | null;
  status: MealAnalysisRecord["status"];
  provider: string;
  model: string;
  result?: MealAnalysis | null;
  error?: string | null;
  error_code?: MealAnalysisRecord["errorCode"];
  source_fingerprint?: string | null;
  source_photo_ids?: unknown;
  source_note?: string | null;
  source_meal_date?: string | null;
  source_meal_type?: MealType | null;
  source_correction?: string | null;
  source_previous_analysis?: MealAnalysis | null;
  attempts?: number | null;
  heartbeat_at?: string | null;
  lease_token?: string | null;
  created_at: string;
  updated_at?: string | null;
  completed_at?: string | null;
  retry_after_at?: string | null;
  failure_started_at?: string | null;
  photo_purge_completed_at?: string | null;
  pipeline?: unknown;
};
type FeelingsRow = Row & {
  id: string;
  user_id: string;
  meal_id: string;
  mouth_warmth_intensity?: number | null;
  stomach_overfull_intensity?: number | null;
  created_at: string;
  updated_at: string;
};

const mealListColumns = "id,user_id,meal_date,meal_type,note,status,entry_state,mouth_warmth_intensity,stomach_overfull_intensity,created_at,updated_at";
const mealListPhotoColumns = "id,user_id,meal_id,origin,object_path,mime_type,bytes,created_at,filename,comment,storage_status,purged_at";
const mealListAnalysisColumns = "id,user_id,meal_id,status,provider,model,result,error,error_code,analysis_request_id,source_revision,source_fingerprint,source_photo_ids,created_at,completed_at,pipeline";
const mealListFeelingColumns = "id,user_id,meal_id,mouth_warmth_intensity,stomach_overfull_intensity,created_at,updated_at";

function asNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asFeeling(value: unknown): MealFeeling {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 5 ? value : null;
}

const mealAnalysisErrorCodes = new Set<NonNullable<MealAnalysisRecord["errorCode"]>>([
  "provider_auth", "provider_rate_limited", "provider_request", "provider_timeout", "provider_unavailable",
  "provider_empty_response", "response_parse_error", "response_schema_error", "invalid_response", "source_unavailable",
  "storage_error", "unknown_analysis_error", "photo_purge_pending",
]);

function analysisErrorCode(value: unknown): MealAnalysisRecord["errorCode"] {
  return typeof value === "string" && mealAnalysisErrorCodes.has(value as NonNullable<MealAnalysisRecord["errorCode"]>)
    ? value as NonNullable<MealAnalysisRecord["errorCode"]>
    : null;
}

function photoFromRow(row: PhotoRow): MealPhoto {
  return {
    id: row.id,
    mealId: row.meal_id,
    origin: row.origin,
    objectPath: row.object_path,
    mimeType: row.mime_type,
    bytes: Number(row.bytes),
    filename: asNullableString(row.filename),
    comment: asNullableString(row.comment),
    createdAt: row.created_at,
    storageStatus: row.storage_status === "purged" || row.storage_status === "purge_pending" ? row.storage_status : "available",
    purgedAt: asNullableString(row.purged_at),
  };
}

function analysisFromRow(row: AnalysisRow): MealAnalysisRecord {
  return {
    id: row.id,
    mealId: row.meal_id,
    status: row.status,
    provider: row.provider,
    model: row.model,
    analysisRequestId: asNullableString(row.analysis_request_id),
    sourceRevision: asNullableString(row.source_revision),
    result: row.result && typeof row.result === "object" ? row.result : null,
    error: asNullableString(row.error),
    sourceFingerprint: asNullableString(row.source_fingerprint),
    errorCode: analysisErrorCode(row.error_code),
    sourcePhotoIds: Array.isArray(row.source_photo_ids) ? row.source_photo_ids.filter((id): id is string => typeof id === "string") : [],
    createdAt: row.created_at,
    completedAt: asNullableString(row.completed_at),
    ...(row.pipeline && typeof row.pipeline === "object" ? { pipeline: row.pipeline as MealAnalysisRecord["pipeline"] } : {}),
  };
}

function mergeFeelings(meal: MealRow, feelings: FeelingsRow | null): Meal {
  const feelingValue = (field: keyof FeelingsRow, fallback: unknown) =>
    asFeeling(feelings && Object.prototype.hasOwnProperty.call(feelings, field) ? feelings[field] : fallback);
  return {
    id: meal.id,
    userId: meal.user_id,
    mealDate: meal.meal_date,
    mealType: meal.meal_type,
    note: asNullableString(meal.note),
    status: meal.status === "confirmed" ? "confirmed" : "draft",
    entryState: meal.entry_state === "skipped" ? "skipped" : "recorded",
    mouthWarmthIntensity: feelingValue("mouth_warmth_intensity", meal.mouth_warmth_intensity),
    stomachOverfullIntensity: feelingValue("stomach_overfull_intensity", meal.stomach_overfull_intensity),
    createdAt: meal.created_at,
    updatedAt: meal.updated_at,
    photos: [],
    analysis: null,
  };
}

type RowsForOptions = {
  mealId?: string;
  mealIds?: readonly string[];
  columns?: string;
};

async function rowsFor<T extends Row>(table: string, userId: string, options: RowsForOptions = {}) {
  if (options.mealIds && options.mealIds.length === 0) return [] as T[];
  const query = createCloudflareAdminClient().from(table).select(options.columns ?? "*").eq("user_id", userId);
  if (options.mealId) query.eq("meal_id", options.mealId);
  if (options.mealIds) query.in("meal_id", [...options.mealIds]);
  const result = await query.order("created_at", { ascending: true });
  if (result.error) throw new Error(`Meal ${table} could not be loaded.`);
  return (result.data ?? []) as T[];
}

export async function findMeal(userId: string, mealId: string): Promise<Meal | null> {
  const admin = createCloudflareAdminClient();
  const [mealResult, photoRows, analysisRows, feelingsRows] = await Promise.all([
    admin.from("meals").select("*").eq("user_id", userId).eq("id", mealId).maybeSingle(),
    rowsFor<PhotoRow>("meal_photos", userId, { mealId }),
    rowsFor<AnalysisRow>("meal_analyses", userId, { mealId }),
    rowsFor<FeelingsRow>("meal_feelings", userId, { mealId }),
  ]);
  if (mealResult.error) throw new Error("The meal could not be loaded.");
  if (!mealResult.data) return null;
  const meal = mergeFeelings(mealResult.data as MealRow, feelingsRows[0] ?? null);
  meal.photos = photoRows.map(photoFromRow);
  const latest = [...analysisRows].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  meal.analysis = latest ? analysisFromRow(latest) : null;
  const successful = selectLatestMealAnalysis(analysisRows, true);
  meal.lastSuccessfulAnalysis = successful ? analysisFromRow(successful) : null;
  return meal;
}

export type ListMealsOptions = { from?: string; to?: string; preferLatestCompletedAnalysis?: boolean };

export function selectLatestMealAnalysis(rows: AnalysisRow[], preferLatestCompletedAnalysis = false) {
  const latest = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  if (!preferLatestCompletedAnalysis) return latest;
  return [...rows]
    .filter((row) => row.status === "completed" && row.result && typeof row.result === "object")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

type MealListRead = {
  meals: MealRow[];
  photoRows: PhotoRow[];
  analysisRows: AnalysisRow[];
  feelingsRows: FeelingsRow[];
};

// The page and the Personal Lab adapter request the same range during one
// server render. React's request cache shares the DB read while keeping data
// isolated between requests.
const readMealList = cache(async (userId: string, from?: string, to?: string): Promise<MealListRead> => {
  const admin = createCloudflareAdminClient();
  let query = admin.from("meals").select(mealListColumns).eq("user_id", userId).order("meal_date", { ascending: false }).order("created_at", { ascending: false });
  if (from) query = query.gte("meal_date", from);
  if (to) query = query.lte("meal_date", to);
  const mealResult = await query;
  if (mealResult.error) throw new Error("Meals could not be loaded.");
  const meals = (mealResult.data ?? []) as MealRow[];
  if (!meals.length) return { meals, photoRows: [], analysisRows: [], feelingsRows: [] };
  const mealIds = meals.map((meal) => meal.id);
  const [photoRows, analysisRows, feelingsRows] = await Promise.all([
    rowsFor<PhotoRow>("meal_photos", userId, { mealIds, columns: mealListPhotoColumns }),
    rowsFor<AnalysisRow>("meal_analyses", userId, { mealIds, columns: mealListAnalysisColumns }),
    rowsFor<FeelingsRow>("meal_feelings", userId, { mealIds, columns: mealListFeelingColumns }),
  ]);
  return { meals, photoRows, analysisRows, feelingsRows };
});

export async function listMeals(userId: string, options: ListMealsOptions = {}) {
  const { meals, photoRows, analysisRows, feelingsRows } = await readMealList(userId, options.from, options.to);
  const photosByMeal = new Map<string, MealPhoto[]>();
  for (const row of photoRows) photosByMeal.set(row.meal_id, [...(photosByMeal.get(row.meal_id) ?? []), photoFromRow(row)]);
  const analysisByMeal = new Map<string, AnalysisRow[]>();
  for (const row of analysisRows) {
    analysisByMeal.set(row.meal_id, [...(analysisByMeal.get(row.meal_id) ?? []), row]);
  }
  const feelingsByMeal = new Map(feelingsRows.map((row) => [row.meal_id, row]));
  return meals.map((row) => {
    const meal = mergeFeelings(row, feelingsByMeal.get(row.id) ?? null);
    meal.photos = photosByMeal.get(row.id) ?? [];
    const selectedAnalysis = selectLatestMealAnalysis(analysisByMeal.get(row.id) ?? [], options.preferLatestCompletedAnalysis);
    meal.analysis = selectedAnalysis ? analysisFromRow(selectedAnalysis) : null;
    const successful = selectLatestMealAnalysis(analysisByMeal.get(row.id) ?? [], true);
    meal.lastSuccessfulAnalysis = successful ? analysisFromRow(successful) : null;
    return meal;
  });
}

export async function findMealByIdempotencyKey(userId: string, key: string) {
  const result = await createCloudflareAdminClient().from("meals").select("id").eq("user_id", userId).eq("idempotency_key", key).maybeSingle();
  if (result.error) throw new Error("The meal retry could not be checked.");
  return result.data ? String(result.data.id) : null;
}

export async function findMealForSlot(userId: string, mealDate: string, mealType: MealType) {
  const result = await createCloudflareAdminClient().from("meals").select("*").eq("user_id", userId).eq("meal_date", mealDate).eq("meal_type", mealType).maybeSingle();
  if (result.error) throw new Error("The meal slot could not be checked.");
  return result.data as MealRow | null;
}

export async function insertMeal(row: MealRow) {
  const persistedRow = { ...row, entry_state: row.entry_state ?? "recorded" };
  const { data, error } = await createCloudflareAdminClient().from("meals").upsert(persistedRow, { onConflict: "user_id,meal_date,meal_type", ignoreDuplicates: true }).select("*").single();
  if (error || !data) throw new Error("The meal could not be saved.");
  return data as MealRow;
}

export async function updateMeal(userId: string, mealId: string, values: Row) {
  const { data, error } = await createCloudflareAdminClient().from("meals").update(values).eq("user_id", userId).eq("id", mealId).select("*").maybeSingle();
  if (error) throw new Error("The meal could not be updated.");
  return data as MealRow | null;
}

/** Persist the explicit journal state and return the complete record for API serialization. */
export async function setMealEntryState(userId: string, mealId: string, entryState: MealEntryState) {
  const updated = await updateMeal(userId, mealId, { entry_state: entryState });
  return updated ? findMeal(userId, mealId) : null;
}

export async function upsertMealFeelings(userId: string, mealId: string, values: { mouthWarmthIntensity?: MealFeeling; stomachOverfullIntensity?: MealFeeling }) {
  const existing = await createCloudflareAdminClient().from("meal_feelings").select("id,created_at").eq("user_id", userId).eq("meal_id", mealId).maybeSingle();
  if (existing.error) throw new Error("The meal feelings could not be checked.");
  const now = new Date().toISOString();
  const row = {
    id: existing.data?.id ?? crypto.randomUUID(),
    user_id: userId,
    meal_id: mealId,
    mouth_warmth_intensity: values.mouthWarmthIntensity,
    stomach_overfull_intensity: values.stomachOverfullIntensity,
    created_at: existing.data?.created_at ?? now,
    updated_at: now,
  };
  const { data, error } = await createCloudflareAdminClient().from("meal_feelings").upsert(row, { onConflict: "user_id,meal_id" }).select("*").single();
  if (error || !data) throw new Error("The meal feelings could not be saved.");
  return data as FeelingsRow;
}

export async function insertPhoto(row: PhotoRow) {
  const { data, error } = await createCloudflareAdminClient().from("meal_photos").insert(row).select("*").single();
  if (error || !data) throw new Error("The meal photo metadata could not be saved.");
  return photoFromRow(data as PhotoRow);
}

/** Persist the object key before upload so an interrupted write remains discoverable. */
export async function createMealPhotoUploadJob(job: MealPhotoUploadJob) {
  const result = await createCloudflareAdminClient().from("meal_photo_upload_jobs").insert(job);
  if (result.error) throw new Error("The photo upload could not be prepared.");
}

export async function deleteMealPhotoUploadJob(userId: string, jobId: string) {
  const result = await createCloudflareAdminClient().from("meal_photo_upload_jobs").delete().eq("user_id", userId).eq("id", jobId);
  if (result.error) throw new Error("The photo upload record could not be cleared.");
}

export async function listStaleMealPhotoUploadJobs(before: string, limit = 100) {
  const result = await createCloudflareAdminClient().from("meal_photo_upload_jobs").select("id,user_id,meal_id,photo_id,object_path,created_at")
    .lt("created_at", before).order("created_at", { ascending: true }).limit(Math.max(1, Math.floor(limit)));
  if (result.error) throw new Error("Abandoned photo uploads could not be listed.");
  return (result.data ?? []) as MealPhotoUploadJob[];
}

export async function updatePhotoOrigin(userId: string, mealId: string, photoId: string, origin: MealOrigin) {
  const { data, error } = await createCloudflareAdminClient().from("meal_photos").update({ origin }).eq("user_id", userId).eq("meal_id", mealId).eq("id", photoId).select("*").maybeSingle();
  if (error) throw new Error("The meal photo origin could not be updated.");
  return data ? photoFromRow(data as PhotoRow) : null;
}

export async function updatePhotoDetails(userId: string, mealId: string, photoId: string, values: { origin?: MealOrigin; comment?: string | null }) {
  const { data, error } = await createCloudflareAdminClient().from("meal_photos").update(values).eq("user_id", userId).eq("meal_id", mealId).eq("id", photoId).select("*").maybeSingle();
  if (error) throw new Error("The meal photo details could not be updated.");
  return data ? photoFromRow(data as PhotoRow) : null;
}

export async function updatePhotoStorage(userId: string, mealId: string, photoId: string, values: { storageStatus: MealPhoto["storageStatus"]; purgedAt?: string | null }) {
  const { data, error } = await createCloudflareAdminClient().from("meal_photos").update({ storage_status: values.storageStatus, purged_at: values.purgedAt ?? null }).eq("user_id", userId).eq("meal_id", mealId).eq("id", photoId).select("*").maybeSingle();
  if (error) throw new Error("The meal photo storage state could not be updated.");
  return data ? photoFromRow(data as PhotoRow) : null;
}

export async function findPhotosByUploadIdempotencyKey(userId: string, mealId: string, key: string) {
  const rows = await rowsFor<PhotoRow>("meal_photos", userId, { mealId });
  return rows.filter((row) => row.upload_idempotency_key === key).map(photoFromRow);
}

export async function deletePhoto(userId: string, mealId: string, photoId: string) {
  const admin = createCloudflareAdminClient();
  const photo = await admin.from("meal_photos").select("*").eq("user_id", userId).eq("meal_id", mealId).eq("id", photoId).maybeSingle();
  if (photo.error) throw new Error("The meal photo could not be checked.");
  if (!photo.data) return false;
  const photoRow = photo.data as PhotoRow;

  // Keep the metadata until the binary is gone. If the request is interrupted
  // between these steps, the cron reconciler still has the object path needed
  // to finish the deletion. The previous order deleted metadata first, which
  // could leave an R2 object with no row to discover later.
  const pending = await admin.from("meal_photos")
    .update({ storage_status: "purge_pending", purged_at: null })
    .eq("user_id", userId)
    .eq("meal_id", mealId)
    .eq("id", photoId)
    .select("id")
    .maybeSingle();
  if (pending.error || !pending.data) throw new Error("The meal photo deletion could not be prepared; retry the operation.");
  try {
    await deleteR2MealPhotoObject(String(photoRow.object_path));
  } catch {
    throw new Error("The meal photo could not be deleted; retry the operation.");
  }

  const purged = await admin.from("meal_photos")
    .update({ storage_status: "purged", purged_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("meal_id", mealId)
    .eq("id", photoId)
    .select("id")
    .maybeSingle();
  if (purged.error || !purged.data) throw new Error("The meal photo deletion could not be finalized; retry the operation.");

  const deleted = await admin.from("meal_photos").delete().eq("user_id", userId).eq("meal_id", mealId).eq("id", photoId);
  if (deleted.error) throw new Error("The meal photo metadata could not be deleted; retry the operation.");
  return true;
}

export async function deleteMeal(userId: string, mealId: string) {
  const meal = await findMeal(userId, mealId);
  if (!meal) return false;
  const admin = createCloudflareAdminClient();
  for (const photo of meal.photos) await deletePhoto(userId, mealId, photo.id);
  const tables = ["meal_analyses", "meal_feelings", "meals"];
  for (const table of tables) {
    const deleted = await admin.from(table).delete().eq("user_id", userId).eq(table === "meals" ? "id" : "meal_id", mealId);
    if (deleted.error) throw new Error("The meal could not be deleted.");
  }
  return true;
}

export async function listMealPhotos(userId: string, mealId: string) {
  return rowsFor<PhotoRow>("meal_photos", userId, { mealId }).then((rows) => rows.map(photoFromRow));
}

export async function findMealPhoto(userId: string, mealId: string, photoId: string) {
  const result = await createCloudflareAdminClient().from("meal_photos").select("*").eq("user_id", userId).eq("meal_id", mealId).eq("id", photoId).maybeSingle();
  if (result.error) throw new Error("The meal photo could not be loaded.");
  return result.data ? photoFromRow(result.data as PhotoRow) : null;
}

export async function findLatestMealAnalysis(userId: string, mealId: string) {
  const rows = await rowsFor<AnalysisRow>("meal_analyses", userId, { mealId });
  const latest = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return latest ? analysisFromRow(latest) : null;
}

export async function findMealAnalysisByRequestId(userId: string, mealId: string, requestId: string) {
  const rows = await rowsFor<AnalysisRow>("meal_analyses", userId, { mealId });
  const match = rows.find((row) => row.analysis_request_id === requestId);
  return match ? analysisFromRow(match) : null;
}

export async function findActiveMealAnalysis(userId: string, mealId: string) {
  const rows = await rowsFor<AnalysisRow>("meal_analyses", userId, { mealId });
  const active = rows
    .filter((row) => row.status === "queued" || row.status === "running")
    .sort((left, right) => left.created_at.localeCompare(right.created_at))[0];
  return active ? analysisFromRow(active) : null;
}

/**
 * Requeues only abandoned worker leases. Reading a meal must stay read-only:
 * recovery belongs to the authenticated cron/worker path, not to a user's
 * GET request.
 */
export async function requeueStaleMealAnalyses(staleAfterMs = 2 * 60 * 1000) {
  const staleBefore = new Date(Date.now() - staleAfterMs).toISOString();
  const requeue = async (stale: "missing-heartbeat" | "expired-heartbeat") => {
    const query = createCloudflareAdminClient().from("meal_analyses").update({ status: "queued", error: null, error_code: null, heartbeat_at: null, lease_token: null, completed_at: null }).eq("status", "running");
    if (stale === "missing-heartbeat") query.is("heartbeat_at", null);
    else query.lt("heartbeat_at", staleBefore);
    return query.select("id");
  };
  const [withoutHeartbeat, expiredHeartbeat] = await Promise.all([
    requeue("missing-heartbeat"),
    requeue("expired-heartbeat"),
  ]);
  if (withoutHeartbeat.error || expiredHeartbeat.error) throw new Error("Stale meal analysis jobs could not be requeued.");
  return (withoutHeartbeat.data ?? []).length + (expiredHeartbeat.data ?? []).length;
}

export async function listQueuedMealAnalyses(limit = 1) {
  await requeueStaleMealAnalyses();
  const result = await createCloudflareAdminClient()
    .from("meal_analyses")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .range(0, Math.max(0, limit - 1));
  if (result.error) throw new Error("Queued meal analyses could not be loaded.");
  return (result.data ?? []) as AnalysisRow[];
}

export async function findQueuedMealAnalysis(userId: string, analysisId: string) {
  const result = await createCloudflareAdminClient()
    .from("meal_analyses")
    .select("*")
    .eq("user_id", userId)
    .eq("id", analysisId)
    .eq("status", "queued")
    .maybeSingle();
  if (result.error) throw new Error("Queued meal analysis could not be loaded.");
  return result.data ? result.data as AnalysisRow : null;
}

/** Rows used by the scheduled photo-purge and failed-analysis reconcilers. */
export async function listMealPhotoRowsForReconciliation(limit = 100) {
  const safeLimit = Math.max(1, Math.floor(limit));
  const admin = createCloudflareAdminClient();
  const rowsForState = (state: "purge_pending" | "available" | "legacy") => {
    const query = admin.from("meal_photos").select("*").order("created_at", { ascending: true }).limit(safeLimit);
    if (state === "legacy") query.is("storage_status", null);
    else query.eq("storage_status", state);
    return query;
  };
  const [pending, available, legacy] = await Promise.all([
    rowsForState("purge_pending"),
    rowsForState("available"),
    rowsForState("legacy"),
  ]);
  if (pending.error || available.error || legacy.error) throw new Error("Meal photos pending reconciliation could not be loaded.");
  return [...(pending.data ?? []), ...(available.data ?? []), ...(legacy.data ?? [])].slice(0, safeLimit) as PhotoRow[];
}

const failedAnalysisRetryColumns = "id,user_id,status,error_code,attempts,retry_after_at,failure_started_at,completed_at,updated_at,created_at";

/** Load only retry candidates with a due backoff and an in-window failure age. */
export async function listRetryableFailedMealAnalyses(options: {
  now: string;
  retentionCutoff: string;
  retryableCodes: readonly string[];
  maxAttempts: number;
  limit?: number;
}) {
  const safeLimit = Math.max(1, Math.floor(options.limit ?? 100));
  if (options.retryableCodes.length === 0) return [] as AnalysisRow[];
  const admin = createCloudflareAdminClient();
  const base = () => admin.from("meal_analyses")
    .select(failedAnalysisRetryColumns)
    .eq("status", "failed")
    .is("photo_purge_completed_at", null)
    .in("error_code", [...options.retryableCodes])
    .or(`attempts.is.null,attempts.lt.${options.maxAttempts}`)
    .or(`retry_after_at.is.null,retry_after_at.lte.${options.now}`);
  const [byFailure, byCompletion, byUpdate, byCreation] = await Promise.all([
    base().gte("failure_started_at", options.retentionCutoff).order("failure_started_at", { ascending: true }).limit(safeLimit),
    base().is("failure_started_at", null).gte("completed_at", options.retentionCutoff).order("completed_at", { ascending: true }).limit(safeLimit),
    base().is("failure_started_at", null).is("completed_at", null).gte("updated_at", options.retentionCutoff).order("updated_at", { ascending: true }).limit(safeLimit),
    base().is("failure_started_at", null).is("completed_at", null).is("updated_at", null).gte("created_at", options.retentionCutoff).order("created_at", { ascending: true }).limit(safeLimit),
  ]);
  const results = [byFailure, byCompletion, byUpdate, byCreation];
  if (results.some((result) => result.error)) throw new Error("Retryable failed meal analyses could not be loaded.");
  const rows = results.flatMap((result) => result.data ?? []) as AnalysisRow[];
  const effectiveFailureTime = (row: AnalysisRow) => row.failure_started_at ?? row.completed_at ?? row.updated_at ?? row.created_at;
  return rows
    .sort((left, right) => String(effectiveFailureTime(left)).localeCompare(String(effectiveFailureTime(right))))
    .slice(0, safeLimit);
}

const failedAnalysisPurgeColumns = "id,user_id,meal_id,status,failure_started_at,completed_at,updated_at,created_at,source_photo_ids,photo_purge_completed_at";

/**
 * Load only terminal-retention candidates. The separate queries preserve the
 * same timestamp fallback order as the service without relying on nested OR
 * filters, which are not supported by the D1 compatibility adapter.
 */
export async function listFailedMealAnalysesForPhotoPurge(cutoff: string, limit = 100) {
  const safeLimit = Math.max(1, Math.floor(limit));
  const admin = createCloudflareAdminClient();
  const base = () => admin.from("meal_analyses")
    .select(failedAnalysisPurgeColumns)
    .eq("status", "failed")
    .is("photo_purge_completed_at", null);
  const [byFailure, byCompletion, byUpdate, byCreation] = await Promise.all([
    base().lte("failure_started_at", cutoff).order("failure_started_at", { ascending: true }).limit(safeLimit),
    base().is("failure_started_at", null).lte("completed_at", cutoff).order("completed_at", { ascending: true }).limit(safeLimit),
    base().is("failure_started_at", null).is("completed_at", null).lte("updated_at", cutoff).order("updated_at", { ascending: true }).limit(safeLimit),
    base().is("failure_started_at", null).is("completed_at", null).is("updated_at", null).lte("created_at", cutoff).order("created_at", { ascending: true }).limit(safeLimit),
  ]);
  const results = [byFailure, byCompletion, byUpdate, byCreation];
  if (results.some((result) => result.error)) throw new Error("Expired failed meal analyses could not be loaded.");
  const rows = results.flatMap((result) => result.data ?? []) as AnalysisRow[];
  const effectiveFailureTime = (row: AnalysisRow) => row.failure_started_at ?? row.completed_at ?? row.updated_at ?? row.created_at;
  return rows
    .sort((left, right) => String(effectiveFailureTime(left)).localeCompare(String(effectiveFailureTime(right))))
    .slice(0, safeLimit);
}

export async function listMealPhotosForFailedAnalysisPurge(userId: string, mealId: string, photoIds?: readonly string[]) {
  const query = createCloudflareAdminClient()
    .from("meal_photos")
    .select("id,object_path,storage_status")
    .eq("user_id", userId)
    .eq("meal_id", mealId);
  if (photoIds) {
    if (photoIds.length === 0) return [] as Array<Pick<MealPhoto, "id" | "objectPath" | "storageStatus">>;
    query.in("id", [...photoIds]);
  }
  const result = await query;
  if (result.error) throw new Error("Failed meal analysis photos could not be loaded.");
  return (result.data ?? []).map((value) => {
    const row = value as Pick<PhotoRow, "id" | "object_path" | "storage_status">;
    return {
      id: row.id,
      objectPath: row.object_path,
      storageStatus: row.storage_status === "purged" || row.storage_status === "purge_pending" ? row.storage_status : "available",
    };
  });
}

export async function insertMealAnalysis(row: AnalysisRow) {
  const { data, error } = await createCloudflareAdminClient().from("meal_analyses").insert(row).select("*").single();
  if (error || !data) throw new Error("The meal analysis could not be saved.");
  return analysisFromRow(data as AnalysisRow);
}

export async function updateMealAnalysis(userId: string, analysisId: string, values: Row, expectedStatus?: MealAnalysisRecord["status"], expectedLeaseToken?: string | null) {
  const query = createCloudflareAdminClient().from("meal_analyses").update(values).eq("user_id", userId).eq("id", analysisId);
  if (expectedStatus) query.eq("status", expectedStatus);
  if (expectedLeaseToken) query.eq("lease_token", expectedLeaseToken);
  const { data, error } = await query.select("*").maybeSingle();
  if (error || !data) throw new Error("The meal analysis could not be updated.");
  return analysisFromRow(data as AnalysisRow);
}

export async function touchMealAnalysis(userId: string, analysisId: string, leaseToken?: string | null) {
  const query = createCloudflareAdminClient()
    .from("meal_analyses")
    .update({ heartbeat_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", analysisId)
    .eq("status", "running");
  if (leaseToken) query.eq("lease_token", leaseToken);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error("The meal analysis heartbeat could not be saved.");
  return Boolean(data);
}

export type { AnalysisRow, MealRow, PhotoRow };
