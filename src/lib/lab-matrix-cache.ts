import "server-only";

import { cloudflareArchives } from "@/lib/cloudflare/db";
import { getR2JsonObject, putR2JsonObject } from "@/lib/r2";

export const LAB_MATRIX_CACHE_VERSION = "matrix-v9";
const LAB_MATRIX_PERIOD_KEYS = ["15", "30", "90", "all"] as const;

export function labMatrixCacheObjectKey(userId: string, periodKey: string) {
  return `lab-matrix-cache/${encodeURIComponent(userId)}/${periodKey}.json`;
}

export function labMatrixCacheObjectKeys(userId: string) {
  return LAB_MATRIX_PERIOD_KEYS.map((periodKey) => labMatrixCacheObjectKey(userId, periodKey));
}

export async function getLabMatrixCacheObject(userId: string, periodKey: string) {
  return getR2JsonObject(labMatrixCacheObjectKey(userId, periodKey));
}

export async function putLabMatrixCacheObject(userId: string, periodKey: string, value: unknown) {
  await putR2JsonObject(labMatrixCacheObjectKey(userId, periodKey), value, `personal-lab-${LAB_MATRIX_CACHE_VERSION}`);
}

export async function deleteLabMatrixCache(userId: string) {
  await Promise.all(labMatrixCacheObjectKeys(userId).map((key) => cloudflareArchives().delete(key)));
}
