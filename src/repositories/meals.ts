import "server-only";

import type {
  Meal,
  MealAnalysis,
  MealAnalysisRecord,
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
  upload_idempotency_key?: string | null;
};
type AnalysisRow = Row & {
  id: string;
  user_id: string;
  meal_id: string;
  status: MealAnalysisRecord["status"];
  provider: string;
  model: string;
  result?: MealAnalysis | null;
  error?: string | null;
  source_photo_ids?: unknown;
  created_at: string;
  completed_at?: string | null;
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

function asNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asFeeling(value: unknown): MealFeeling {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 5 ? value : null;
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
    createdAt: row.created_at,
  };
}

function analysisFromRow(row: AnalysisRow): MealAnalysisRecord {
  return {
    id: row.id,
    mealId: row.meal_id,
    status: row.status,
    provider: row.provider,
    model: row.model,
    result: row.result && typeof row.result === "object" ? row.result : null,
    error: asNullableString(row.error),
    sourcePhotoIds: Array.isArray(row.source_photo_ids) ? row.source_photo_ids.filter((id): id is string => typeof id === "string") : [],
    createdAt: row.created_at,
    completedAt: asNullableString(row.completed_at),
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
    mouthWarmthIntensity: feelingValue("mouth_warmth_intensity", meal.mouth_warmth_intensity),
    stomachOverfullIntensity: feelingValue("stomach_overfull_intensity", meal.stomach_overfull_intensity),
    createdAt: meal.created_at,
    updatedAt: meal.updated_at,
    photos: [],
    analysis: null,
  };
}

async function rowsFor<T extends Row>(table: string, userId: string, mealId?: string) {
  const query = createCloudflareAdminClient().from(table).select("*").eq("user_id", userId);
  if (mealId) query.eq("meal_id", mealId);
  const result = await query.order("created_at", { ascending: true });
  if (result.error) throw new Error(`Meal ${table} could not be loaded.`);
  return (result.data ?? []) as T[];
}

export async function findMeal(userId: string, mealId: string): Promise<Meal | null> {
  const admin = createCloudflareAdminClient();
  const [mealResult, photoRows, analysisRows, feelingsRows] = await Promise.all([
    admin.from("meals").select("*").eq("user_id", userId).eq("id", mealId).maybeSingle(),
    rowsFor<PhotoRow>("meal_photos", userId, mealId),
    rowsFor<AnalysisRow>("meal_analyses", userId, mealId),
    rowsFor<FeelingsRow>("meal_feelings", userId, mealId),
  ]);
  if (mealResult.error) throw new Error("The meal could not be loaded.");
  if (!mealResult.data) return null;
  const meal = mergeFeelings(mealResult.data as MealRow, feelingsRows[0] ?? null);
  meal.photos = photoRows.map(photoFromRow);
  const latest = [...analysisRows].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  meal.analysis = latest ? analysisFromRow(latest) : null;
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

export async function listMeals(userId: string, options: ListMealsOptions = {}) {
  const admin = createCloudflareAdminClient();
  let query = admin.from("meals").select("*").eq("user_id", userId).order("meal_date", { ascending: false }).order("created_at", { ascending: false });
  if (options.from) query = query.gte("meal_date", options.from);
  if (options.to) query = query.lte("meal_date", options.to);
  const mealResult = await query;
  if (mealResult.error) throw new Error("Meals could not be loaded.");
  const meals = (mealResult.data ?? []) as MealRow[];
  if (!meals.length) return [];
  const [photoRows, analysisRows, feelingsRows] = await Promise.all([
    rowsFor<PhotoRow>("meal_photos", userId),
    rowsFor<AnalysisRow>("meal_analyses", userId),
    rowsFor<FeelingsRow>("meal_feelings", userId),
  ]);
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
  const { data, error } = await createCloudflareAdminClient().from("meals").upsert(row, { onConflict: "user_id,meal_date,meal_type", ignoreDuplicates: true }).select("*").single();
  if (error || !data) throw new Error("The meal could not be saved.");
  return data as MealRow;
}

export async function updateMeal(userId: string, mealId: string, values: Row) {
  const { data, error } = await createCloudflareAdminClient().from("meals").update(values).eq("user_id", userId).eq("id", mealId).select("*").maybeSingle();
  if (error) throw new Error("The meal could not be updated.");
  return data as MealRow | null;
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

export async function updatePhotoOrigin(userId: string, mealId: string, photoId: string, origin: MealOrigin) {
  const { data, error } = await createCloudflareAdminClient().from("meal_photos").update({ origin }).eq("user_id", userId).eq("meal_id", mealId).eq("id", photoId).select("*").maybeSingle();
  if (error) throw new Error("The meal photo origin could not be updated.");
  return data ? photoFromRow(data as PhotoRow) : null;
}

export async function findPhotosByUploadIdempotencyKey(userId: string, mealId: string, key: string) {
  const rows = await rowsFor<PhotoRow>("meal_photos", userId, mealId);
  return rows.filter((row) => row.upload_idempotency_key === key).map(photoFromRow);
}

export async function deletePhoto(userId: string, mealId: string, photoId: string) {
  const admin = createCloudflareAdminClient();
  const photo = await admin.from("meal_photos").select("*").eq("user_id", userId).eq("meal_id", mealId).eq("id", photoId).maybeSingle();
  if (photo.error) throw new Error("The meal photo could not be checked.");
  if (!photo.data) return false;
  const deleted = await admin.from("meal_photos").delete().eq("user_id", userId).eq("meal_id", mealId).eq("id", photoId);
  if (deleted.error) throw new Error("The meal photo metadata could not be deleted.");
  try {
    await deleteR2MealPhotoObject(String((photo.data as PhotoRow).object_path));
  } catch {
    const restored = await admin.from("meal_photos").upsert(photo.data as PhotoRow).then((result) => result);
    if (restored.error) throw new Error("The meal photo could not be deleted or preserved for retry.");
    throw new Error("The meal photo could not be deleted; retry the operation.");
  }
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
  return rowsFor<PhotoRow>("meal_photos", userId, mealId).then((rows) => rows.map(photoFromRow));
}

export async function findMealPhoto(userId: string, mealId: string, photoId: string) {
  const result = await createCloudflareAdminClient().from("meal_photos").select("*").eq("user_id", userId).eq("meal_id", mealId).eq("id", photoId).maybeSingle();
  if (result.error) throw new Error("The meal photo could not be loaded.");
  return result.data ? photoFromRow(result.data as PhotoRow) : null;
}

export async function findLatestMealAnalysis(userId: string, mealId: string) {
  const rows = await rowsFor<AnalysisRow>("meal_analyses", userId, mealId);
  const latest = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return latest ? analysisFromRow(latest) : null;
}

export async function insertMealAnalysis(row: AnalysisRow) {
  const { data, error } = await createCloudflareAdminClient().from("meal_analyses").insert(row).select("*").single();
  if (error || !data) throw new Error("The meal analysis could not be saved.");
  return analysisFromRow(data as AnalysisRow);
}

export async function updateMealAnalysis(userId: string, analysisId: string, values: Row) {
  const { data, error } = await createCloudflareAdminClient().from("meal_analyses").update(values).eq("user_id", userId).eq("id", analysisId).select("*").maybeSingle();
  if (error || !data) throw new Error("The meal analysis could not be updated.");
  return analysisFromRow(data as AnalysisRow);
}

export type { AnalysisRow, MealRow, PhotoRow };
