import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recomputeUserHealth } from "@/services/analysis";

import {
  GOOGLE_HEALTH_DATA_TYPES,
  GOOGLE_HEALTH_DAILY_ROLLUP_TYPES,
  dailyRollUpGoogleHealthData,
  type GoogleHealthDataType,
  listGoogleHealthDataPoints,
  refreshGoogleHealthToken,
} from "./client";
import { normalizeGoogleHealthDailyRollup, normalizeGoogleHealthPoint } from "./normalize";

type SyncCursor = {
  typeIndex?: number;
  windowStart?: string;
  pageToken?: string;
};

type SyncJob = {
  id: string;
  user_id: string;
  connection_id: string;
  data_types: string[];
  range_start: string;
  range_end: string;
  cursor: SyncCursor;
  attempts: number;
  progress: number;
  status: string;
};

type ProviderConnection = {
  id: string;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string | null;
  token_expires_at: string | null;
};

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function earlierDate(first: Date, second: Date) {
  return first < second ? first : second;
}

async function getAccessToken(connection: ProviderConnection) {
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 60_000) return decryptSecret(connection.access_token_ciphertext);
  if (!connection.refresh_token_ciphertext) throw new Error("Google Health refresh token is missing.");

  const tokens = await refreshGoogleHealthToken(decryptSecret(connection.refresh_token_ciphertext));
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("provider_connections").update({
    access_token_ciphertext: encryptSecret(tokens.access_token),
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    status: "connected",
    last_error_code: null,
  }).eq("id", connection.id);
  if (error) throw new Error("Refreshed Google Health token could not be stored.");
  return tokens.access_token;
}

async function upsertRecords(records: ReturnType<typeof normalizeGoogleHealthPoint>[]) {
  const admin = createSupabaseAdminClient();
  for (let index = 0; index < records.length; index += 500) {
    const batch = records.slice(index, index + 500);
    const { error } = await admin.from("health_records").upsert(batch, {
      onConflict: "user_id,provider,data_type,source_record_id",
    });
    if (error) throw new Error(`Health records could not be stored: ${error.message}`);
  }
}

function calculateProgress(typeIndex: number, typeCount: number, windowStart: Date, start: Date, end: Date) {
  const range = Math.max(end.getTime() - start.getTime(), 1);
  const rangeProgress = Math.min(Math.max((windowStart.getTime() - start.getTime()) / range, 0), 1);
  return Math.min(99, Math.floor(((typeIndex + rangeProgress) / typeCount) * 100));
}

const ANALYTICS_LOOKBACK_DAYS = 120;

export function shouldRefreshAnalytics(importedRecords: number, windowEnd: Date, now = new Date()) {
  if (importedRecords === 0) return false;
  const analyticsStart = new Date(now);
  analyticsStart.setUTCDate(analyticsStart.getUTCDate() - ANALYTICS_LOOKBACK_DAYS);
  return windowEnd >= analyticsStart;
}

export async function processGoogleHealthSyncJob(jobId: string) {
  const admin = createSupabaseAdminClient();
  const { data: rawJob, error: jobError } = await admin.from("sync_jobs").select("*").eq("id", jobId).single();
  if (jobError || !rawJob) throw new Error("Sync job was not found.");
  const job = rawJob as SyncJob;

  if (job.status !== "queued") {
    return { completed: job.status === "completed", progress: job.progress ?? 0, skipped: true, analyticsRefreshed: false, analytics: null };
  }

  const { data: rawClaimedJob, error: claimError } = await admin.from("sync_jobs").update({
    status: "running",
    started_at: new Date().toISOString(),
    attempts: job.attempts + 1,
    error_code: null,
    error_message: null,
  }).eq("id", job.id).eq("status", "queued").select("*").maybeSingle();
  if (claimError) throw new Error("Sync job could not be claimed.");
  if (!rawClaimedJob) return { completed: false, progress: job.progress ?? 0, skipped: true, analyticsRefreshed: false, analytics: null };
  const claimedJob = rawClaimedJob as SyncJob;

  try {
    const { data: rawConnection, error: connectionError } = await admin
      .from("provider_connections")
      .select("id,access_token_ciphertext,refresh_token_ciphertext,token_expires_at")
      .eq("id", claimedJob.connection_id)
      .single();
    if (connectionError || !rawConnection) throw new Error("Google Health connection was not found.");

    const dataTypes = (claimedJob.data_types.length ? claimedJob.data_types : GOOGLE_HEALTH_DATA_TYPES) as GoogleHealthDataType[];
    const typeIndex = claimedJob.cursor.typeIndex ?? 0;
    const dataType = dataTypes[typeIndex];
    if (!dataType) {
      const analytics = await recomputeUserHealth(claimedJob.user_id);
      await admin.from("sync_jobs").update({ status: "completed", progress: 100, completed_at: new Date().toISOString() }).eq("id", claimedJob.id);
      await admin.from("provider_connections").update({ last_synced_at: new Date().toISOString(), status: "connected" }).eq("id", claimedJob.connection_id);
      console.info("[google-health-sync] completed pending analytics", { jobId: claimedJob.id, analytics });
      return { completed: true, progress: 100, analyticsRefreshed: true, analytics };
    }

    const start = new Date(claimedJob.range_start);
    const end = new Date(claimedJob.range_end);
    const windowStart = new Date(claimedJob.cursor.windowStart ?? claimedJob.range_start);
    const windowDays = dataType === "heart-rate" || dataType === "active-minutes" || dataType === "total-calories" || dataType === "calories-in-heart-rate-zone" ? 14 : 90;
    const windowEnd = earlierDate(addDays(windowStart, windowDays), end);
    const accessToken = await getAccessToken(rawConnection as ProviderConnection);
    const usesDailyRollup = GOOGLE_HEALTH_DAILY_ROLLUP_TYPES.includes(dataType as (typeof GOOGLE_HEALTH_DAILY_ROLLUP_TYPES)[number]);
    let nextPageToken: string | undefined;
    let points: Record<string, unknown>[];
    if (usesDailyRollup) {
      const response = await dailyRollUpGoogleHealthData({ accessToken, dataType, start: windowStart, end: windowEnd, pageToken: claimedJob.cursor.pageToken });
      points = response.rollupDataPoints ?? [];
      nextPageToken = response.nextPageToken;
    } else {
      const response = await listGoogleHealthDataPoints({ accessToken, dataType, start: windowStart, end: windowEnd, pageToken: claimedJob.cursor.pageToken });
      points = response.dataPoints ?? [];
      nextPageToken = response.nextPageToken;
    }
    const records = points.map((point) => usesDailyRollup
      ? normalizeGoogleHealthDailyRollup(claimedJob.user_id, dataType, point)
      : normalizeGoogleHealthPoint(claimedJob.user_id, dataType, point));
    await upsertRecords(records);
    let nextCursor: SyncCursor;
    let nextTypeIndex = typeIndex;
    if (nextPageToken) {
      nextCursor = { typeIndex, windowStart: windowStart.toISOString(), pageToken: nextPageToken };
    } else if (windowEnd < end) {
      nextCursor = { typeIndex, windowStart: windowEnd.toISOString() };
    } else {
      nextTypeIndex = typeIndex + 1;
      nextCursor = { typeIndex: nextTypeIndex, windowStart: start.toISOString() };
    }

    const completed = nextTypeIndex >= dataTypes.length;
    const progress = completed ? 100 : calculateProgress(nextTypeIndex, dataTypes.length, new Date(nextCursor.windowStart ?? start), start, end);
    const analyticsRefreshed = shouldRefreshAnalytics(records.length, windowEnd);
    let analytics = null;
    if (analyticsRefreshed || completed) {
      analytics = await recomputeUserHealth(claimedJob.user_id);
    }
    await admin.from("sync_jobs").update({
      cursor: nextCursor,
      progress,
      attempts: 0,
      status: completed ? "completed" : "queued",
      completed_at: completed ? new Date().toISOString() : null,
    }).eq("id", claimedJob.id);

    if (completed) {
      const { error: freshnessError } = await admin.from("provider_connections").update({
        last_synced_at: new Date().toISOString(),
        status: "connected",
        last_error_code: null,
      }).eq("id", claimedJob.connection_id);
      if (freshnessError) throw new Error("Google Health sync freshness could not be stored.");
    }

    console.info("[google-health-sync] batch processed", {
      jobId: claimedJob.id,
      dataType,
      importedRecords: records.length,
      progress,
      completed,
      analyticsRefreshed: analyticsRefreshed || completed,
      analytics,
    });
    return { completed, progress, imported: records.length, dataType, analyticsRefreshed: analyticsRefreshed || completed, analytics };
  } catch (error) {
    const terminal = claimedJob.attempts >= 3;
    const message = error instanceof Error ? error.message : "Unknown Google Health sync error.";
    await admin.from("sync_jobs").update({
      status: terminal ? "failed" : "queued",
      error_code: "GOOGLE_HEALTH_SYNC_FAILED",
      error_message: message.slice(0, 1000),
    }).eq("id", claimedJob.id);
    await admin.from("provider_connections").update({ status: terminal ? "error" : "connected", last_error_code: "GOOGLE_HEALTH_SYNC_FAILED" }).eq("id", claimedJob.connection_id);
    console.error("[google-health-sync] batch failed", {
      jobId: claimedJob.id,
      error: message,
      terminal,
    });
    throw error;
  }
}
