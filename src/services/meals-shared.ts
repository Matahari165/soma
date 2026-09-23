import "server-only";

import { MAX_MEAL_PHOTO_BYTES, type Meal, type UpdateMealInput } from "@/domain/meals";
import * as cloudflareDb from "@/lib/cloudflare/db";
import { findMeal, type AnalysisRow } from "@/repositories/meals";

const { claimCloudflareLock, claimCloudflareLockWithToken, releaseCloudflareLock, releaseCloudflareLockWithToken } = cloudflareDb;

export class MealServiceError extends Error {
  constructor(readonly code: "not_found" | "invalid" | "conflict" | "unavailable", message: string, readonly diagnosticCode?: "provider_auth" | "provider_rate_limited" | "provider_request" | "provider_timeout" | "provider_unavailable" | "provider_empty_response" | "response_parse_error" | "response_schema_error" | "invalid_response" | "source_unavailable" | "storage_error" | "unknown_analysis_error" | "photo_purge_pending") {
    super(message);
    this.name = "MealServiceError";
  }
}
export const ANALYSIS_LEASE_TTL_MS = 120_000;
export const ANALYSIS_HEARTBEAT_MS = 30_000;
export const FAILED_ANALYSIS_PHOTO_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_AUTOMATIC_ANALYSIS_RETRIES = 3;
export const RETRY_BACKOFF_MS = [2 * 60_000, 10 * 60_000, 60 * 60_000] as const;

const RETRYABLE_ANALYSIS_CODES = new Set([
  "provider_rate_limited",
  "provider_request",
  "provider_timeout",
  "provider_unavailable",
  "provider_empty_response",
  "response_parse_error",
  "response_schema_error",
  "storage_error",
  "unknown_analysis_error",
]);

export function logMeal(level: "info" | "warn" | "error", stage: string, error?: unknown, durationMs?: number) {
  console[level]("[meal-analysis]", {
    stage,
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(error === undefined ? {} : { reason: error instanceof Error ? error.name : "unknown" }),
  });
}

export async function timedMealStage<T>(stage: string, operation: () => Promise<T>) {
  const startedAt = Date.now();
  try {
    return await operation();
  } finally {
    logMeal("info", stage, undefined, Date.now() - startedAt);
  }
}
export async function claimMealLease(lockKey: string, userId: string, ttlMs: number) {
  if (typeof claimCloudflareLockWithToken === "function") {
    const token = await claimCloudflareLockWithToken(lockKey, userId, ttlMs);
    // Older test/runtime adapters may expose the original boolean lock only.
    // The production token implementation returns null on contention, never
    // undefined, so undefined is a safe compatibility signal here.
    if (token !== undefined) return { claimed: Boolean(token), token };
  }
  return { claimed: await claimCloudflareLock(lockKey, userId, ttlMs), token: null };
}

export async function releaseMealLease(lockKey: string, userId: string, token: string | null) {
  if (token && typeof releaseCloudflareLockWithToken === "function") return releaseCloudflareLockWithToken(lockKey, userId, token);
  return releaseCloudflareLock(lockKey, userId);
}
export function hasPreservedAnalysis(meal: Meal, confirmedAnalysis: UpdateMealInput["confirmedAnalysis"]) {
  if (meal.analysis?.status === "queued" || meal.analysis?.status === "running") return Boolean(confirmedAnalysis);
  return Boolean(
    confirmedAnalysis
      ?? (meal.analysis?.status === "completed" && meal.analysis.result ? meal.analysis.result : null)
      ?? (meal.lastSuccessfulAnalysis?.status === "completed" && meal.lastSuccessfulAnalysis.result ? meal.lastSuccessfulAnalysis.result : null),
  );
}

export function analysisUsedForConfirmation(meal: Meal) {
  if (meal.analysis?.status === "queued" || meal.analysis?.status === "running") return null;
  if (meal.analysis?.status === "completed" && meal.analysis.result) return meal.analysis;
  if (meal.lastSuccessfulAnalysis?.status === "completed" && meal.lastSuccessfulAnalysis.result) return meal.lastSuccessfulAnalysis;
  return null;
}

/**
 * Hashes only the current analysis evidence. The note and photo metadata never
 * leave this process and are not written to logs or diagnostics.
 */
export async function computeMealSourceFingerprint(meal: Pick<Meal, "note" | "photos">) {
  const photos = meal.photos
    .filter((photo) => (photo.storageStatus ?? "available") === "available")
    .map((photo) => ({ id: photo.id, origin: photo.origin, comment: photo.comment?.trim() ?? "", status: photo.storageStatus ?? "available" }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const payload = JSON.stringify({ version: 1, note: meal.note?.trim() ?? "", photos });
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function analysisSourceStillCurrent(userId: string, mealId: string, sourceRevision: string | null | undefined, sourceFingerprint: string | null | undefined) {
  const meal = await findMeal(userId, mealId);
  if (!meal) return false;
  if (sourceRevision && meal.updatedAt !== sourceRevision) return false;
  if (!sourceFingerprint) return true;
  return await computeMealSourceFingerprint(meal) === sourceFingerprint;
}
export function isRetryableAnalysisCode(value: unknown) {
  return typeof value === "string" && RETRYABLE_ANALYSIS_CODES.has(value);
}

export function rowPhotoIds(row: AnalysisRow) {
  return Array.isArray(row.source_photo_ids)
    ? row.source_photo_ids.filter((id): id is string => typeof id === "string")
    : [];
}
export function assertMealId(id: string) {
  if (!/^[0-9a-f-]{20,80}$/i.test(id)) throw new MealServiceError("invalid", "The meal id is invalid.");
}

export function assertPhotoSize(size: number) {
  if (size <= 0 || size > MAX_MEAL_PHOTO_BYTES) throw new MealServiceError("invalid", "Each photo must be between 1 byte and 12 MB.");
}
