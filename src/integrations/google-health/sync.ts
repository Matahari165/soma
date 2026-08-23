import { decryptSecret, encryptSecret, stableHash } from "@/lib/crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recomputeUserHealth } from "@/services/analysis";

import {
  GOOGLE_HEALTH_DATA_TYPES,
  GOOGLE_HEALTH_DAILY_ROLLUP_TYPES,
  GoogleHealthRequestError,
  dailyRollUpGoogleHealthData,
  type GoogleHealthDataType,
  listGoogleHealthDataPoints,
  refreshGoogleHealthToken,
  usesCivilDateWindow,
} from "./client";
import { normalizeGoogleHealthDailyRollup, normalizeGoogleHealthPoint } from "./normalize";

type SyncCursor = {
  typeIndex?: number;
  windowStart?: string;
  pageToken?: string;
  phase?: "materializing";
  typeErrors?: Record<string, string>;
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
  sync_trigger: string;
  retry_after?: string | null;
};

type ProviderConnection = {
  id: string;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string | null;
  token_expires_at: string | null;
};

const DIRECT_UPSERT_DATA_TYPES = new Set<GoogleHealthDataType>([
  "heart-rate",
  "heart-rate-variability",
  "activity-level",
]);

export function usesDirectGoogleHealthUpsert(dataType: GoogleHealthDataType) {
  return DIRECT_UPSERT_DATA_TYPES.has(dataType);
}

type NormalizedGoogleHealthRecord = ReturnType<typeof normalizeGoogleHealthPoint>;

export function deduplicateGoogleHealthRecords(records: NormalizedGoogleHealthRecord[]) {
  const bySourceRecordId = new Map<string, NormalizedGoogleHealthRecord>();
  for (const record of records) bySourceRecordId.set(record.source_record_id, record);
  return [...bySourceRecordId.values()];
}

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

async function stageRecords(jobId: string, reconciliationToken: string, records: NormalizedGoogleHealthRecord[]) {
  const admin = createSupabaseAdminClient();
  const uniqueRecords = deduplicateGoogleHealthRecords(records);
  for (let index = 0; index < uniqueRecords.length; index += 500) {
    const batch = uniqueRecords.slice(index, index + 500).map((record) => ({ ...record, job_id: jobId, reconciliation_token: reconciliationToken }));
    const { error } = await admin.from("google_health_reconciliation_stage").upsert(batch, {
      onConflict: "job_id,reconciliation_token,source_record_id",
    });
    if (error) throw new Error(`Health records could not be staged: ${error.message}`);
  }
}

async function publishRecords(records: NormalizedGoogleHealthRecord[]) {
  const admin = createSupabaseAdminClient();
  const uniqueRecords = deduplicateGoogleHealthRecords(records);
  for (let index = 0; index < uniqueRecords.length; index += 1000) {
    const { error } = await admin.from("health_records").upsert(uniqueRecords.slice(index, index + 1000), {
      onConflict: "user_id,provider,data_type,source_record_id",
    });
    if (error) throw new Error(`Health records could not be published: ${error.message}`);
  }
}

async function reconcileWindow(input: {
  userId: string;
  dataType: GoogleHealthDataType;
  start: Date;
  end: Date;
  reconciliationToken: string;
}) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("reconcile_google_health_window", {
    p_user_id: input.userId,
    p_data_type: input.dataType,
    p_window_start: input.start.toISOString(),
    p_window_end: input.end.toISOString(),
    p_date_based: usesCivilDateWindow(input.dataType),
    p_reconciliation_token: input.reconciliationToken,
  });
  if (error) throw new Error(`Google Health window could not be reconciled: ${error.message}`);
  return Number(data ?? 0);
}

function calculateProgress(typeIndex: number, typeCount: number, windowStart: Date, start: Date, end: Date) {
  const range = Math.max(end.getTime() - start.getTime(), 1);
  const rangeProgress = Math.min(Math.max((windowStart.getTime() - start.getTime()) / range, 0), 1);
  return Math.min(99, Math.floor(((typeIndex + rangeProgress) / typeCount) * 100));
}

export function classifyGoogleHealthSyncError(error: unknown) {
  if (error instanceof GoogleHealthRequestError) {
    if (error.status === 401) return { code: "GOOGLE_HEALTH_AUTH_EXPIRED", retryable: false, connectionStatus: "expired" as const };
    if (error.status === 403) return { code: "GOOGLE_HEALTH_PERMISSION_DENIED", retryable: false, connectionStatus: "connected" as const };
    if (error.status === 429) return { code: "GOOGLE_HEALTH_RATE_LIMITED", retryable: true, connectionStatus: "connected" as const };
    if (error.status >= 500) return { code: "GOOGLE_HEALTH_UNAVAILABLE", retryable: true, connectionStatus: "connected" as const };
  }
  return { code: "GOOGLE_HEALTH_SYNC_FAILED", retryable: true, connectionStatus: "connected" as const };
}

export function shouldRefreshAnalyticsForTrigger(trigger: string) {
  return trigger !== "webhook";
}

export async function processGoogleHealthSyncJob(jobId: string, options: { refreshAnalytics?: boolean } = {}) {
  const refreshAnalytics = options.refreshAnalytics ?? true;
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
      const analytics = refreshAnalytics ? await recomputeUserHealth(claimedJob.user_id) : null;
      await admin.from("sync_jobs").update({ status: "completed", progress: 100, completed_at: new Date().toISOString() }).eq("id", claimedJob.id);
      const completedAt = new Date().toISOString();
      await admin.from("provider_connections").update({
        last_synced_at: completedAt,
        ...(shouldRefreshAnalyticsForTrigger(claimedJob.sync_trigger) ? { last_lab_synced_at: completedAt } : {}),
        status: "connected",
      }).eq("id", claimedJob.connection_id);
      console.info("[google-health-sync] completed pending analytics", { jobId: claimedJob.id, analytics });
      return { completed: true, progress: 100, analyticsRefreshed: refreshAnalytics, analytics };
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
    const reconciliationToken = stableHash(`${claimedJob.id}:${typeIndex}:${windowStart.toISOString()}`);
    const records = points.map((point) => usesDailyRollup
        ? normalizeGoogleHealthDailyRollup(claimedJob.user_id, dataType, point)
        : normalizeGoogleHealthPoint(claimedJob.user_id, dataType, point));
    const directUpsert = usesDirectGoogleHealthUpsert(dataType);
    if (directUpsert) await publishRecords(records);
    else await stageRecords(claimedJob.id, reconciliationToken, records);
    const deletedRecords = nextPageToken || directUpsert ? 0 : await reconcileWindow({
        userId: claimedJob.user_id,
        dataType,
        start: windowStart,
        end: windowEnd,
        reconciliationToken,
      });
    let nextCursor: SyncCursor;
    let nextTypeIndex = typeIndex;
    if (nextPageToken) {
      nextCursor = { typeIndex, windowStart: windowStart.toISOString(), pageToken: nextPageToken, typeErrors: claimedJob.cursor.typeErrors };
    } else if (windowEnd < end) {
      nextCursor = { typeIndex, windowStart: windowEnd.toISOString(), typeErrors: claimedJob.cursor.typeErrors };
    } else {
      nextTypeIndex = typeIndex + 1;
      nextCursor = { typeIndex: nextTypeIndex, windowStart: start.toISOString(), typeErrors: claimedJob.cursor.typeErrors };
    }

    const completed = nextTypeIndex >= dataTypes.length;
    if (completed && refreshAnalytics) {
      const { error: phaseError } = await admin.from("sync_jobs").update({
        cursor: { ...nextCursor, phase: "materializing" },
        progress: 99,
        attempts: 0,
        retry_after: null,
        status: "queued",
        started_at: null,
      }).eq("id", claimedJob.id);
      if (phaseError) throw new Error("Google Health materialization state could not be stored.");
      console.info("[google-health-sync] data import completed; analytics queued", { jobId: claimedJob.id });
      return { completed: false, progress: 99, materializing: true, analyticsRefreshed: false, analytics: null };
    }
    const progress = completed ? 100 : calculateProgress(nextTypeIndex, dataTypes.length, new Date(nextCursor.windowStart ?? start), start, end);
    const analyticsRefreshed = false;
    const analytics = null;
    await admin.from("sync_jobs").update({
      cursor: nextCursor,
      progress,
      attempts: 0,
      retry_after: null,
      status: completed ? "completed" : "queued",
      completed_at: completed ? new Date().toISOString() : null,
    }).eq("id", claimedJob.id);

    if (completed) {
      const completedAt = new Date().toISOString();
      const { error: freshnessError } = await admin.from("provider_connections").update({
        last_synced_at: completedAt,
        ...(shouldRefreshAnalyticsForTrigger(claimedJob.sync_trigger) ? { last_lab_synced_at: completedAt } : {}),
        status: "connected",
        last_error_code: null,
      }).eq("id", claimedJob.connection_id);
      if (freshnessError) throw new Error("Google Health sync freshness could not be stored.");
    }

    console.info("[google-health-sync] batch processed", {
      jobId: claimedJob.id,
      dataType,
      importedRecords: records.length,
      deletedRecords,
      progress,
      completed,
      analyticsRefreshed,
      analytics,
    });
    return { completed, progress, imported: records.length, deleted: deletedRecords, dataType, analyticsRefreshed, analytics };
  } catch (error) {
    const classification = classifyGoogleHealthSyncError(error);
    if (classification.code === "GOOGLE_HEALTH_PERMISSION_DENIED") {
      const dataTypes = (claimedJob.data_types.length ? claimedJob.data_types : GOOGLE_HEALTH_DATA_TYPES) as GoogleHealthDataType[];
      const typeIndex = claimedJob.cursor.typeIndex ?? 0;
      const dataType = dataTypes[typeIndex];
      if (dataType) {
        const { error: stageCleanupError } = await admin.from("google_health_reconciliation_stage").delete().eq("job_id", claimedJob.id).eq("data_type", dataType);
        if (stageCleanupError) console.error("[google-health-sync] denied data type staging cleanup failed", { jobId: claimedJob.id, dataType });
        const nextTypeIndex = typeIndex + 1;
        const message = error instanceof Error ? error.message : "Google Health denied this data type.";
        await admin.from("sync_jobs").update({
          status: "queued",
          cursor: {
            typeIndex: nextTypeIndex,
            windowStart: claimedJob.range_start,
            typeErrors: { ...(claimedJob.cursor.typeErrors ?? {}), [dataType]: classification.code },
          },
          progress: Math.min(99, Math.floor((nextTypeIndex / dataTypes.length) * 100)),
          attempts: 0,
          retry_after: null,
          error_code: null,
          error_message: null,
          started_at: null,
        }).eq("id", claimedJob.id);
        await admin.from("provider_connections").update({ status: "connected", last_error_code: classification.code }).eq("id", claimedJob.connection_id);
        console.warn("[google-health-sync] data type skipped after permission denial", { jobId: claimedJob.id, dataType, error: message });
        return { completed: false, progress: Math.min(99, Math.floor((nextTypeIndex / dataTypes.length) * 100)), skippedDataType: dataType, analyticsRefreshed: false, analytics: null };
      }
    }
    const terminal = !classification.retryable || claimedJob.attempts >= 3;
    const message = error instanceof Error ? error.message : "Unknown Google Health sync error.";
    const retryAfter = terminal ? null : new Date(Date.now() + Math.min(15, claimedJob.attempts ** 2) * 60_000).toISOString();
    await admin.from("sync_jobs").update({
      status: terminal ? "failed" : "queued",
      error_code: classification.code,
      error_message: message.slice(0, 1000),
      retry_after: retryAfter,
    }).eq("id", claimedJob.id);
    await admin.from("provider_connections").update({
      status: classification.connectionStatus,
      last_error_code: classification.code,
    }).eq("id", claimedJob.connection_id);
    if (terminal) {
      const { error: stageCleanupError } = await admin.from("google_health_reconciliation_stage").delete().eq("job_id", claimedJob.id);
      if (stageCleanupError) console.error("[google-health-sync] terminal staging cleanup failed", { jobId: claimedJob.id });
    }
    console.error("[google-health-sync] batch failed", {
      jobId: claimedJob.id,
      error: message,
      terminal,
    });
    throw error;
  }
}

export async function drainGoogleHealthSyncJob(
  jobId: string,
  options: { maxBatches?: number; maxDurationMs?: number; refreshAnalytics?: boolean } = {},
) {
  const maxBatches = options.maxBatches ?? 24;
  const deadline = Date.now() + (options.maxDurationMs ?? 45_000);
  let latest: Awaited<ReturnType<typeof processGoogleHealthSyncJob>> | null = null;

  for (let batch = 0; batch < maxBatches && Date.now() < deadline; batch += 1) {
    latest = await processGoogleHealthSyncJob(jobId, { refreshAnalytics: options.refreshAnalytics });
    if (latest.completed || latest.skipped || "materializing" in latest) break;
  }

  return latest;
}
