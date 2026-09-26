import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { createCloudflareAdminClient, claimCloudflareLock, releaseCloudflareLock } from "@/lib/cloudflare/db";
import { recomputeUserHealth } from "@/services/analysis";

import {
  getGrantedGoogleHealthDataTypes,
  listGoogleHealthDataPoints,
  refreshGoogleHealthToken,
  type GoogleHealthDataType,
} from "./client";
import { normalizeGoogleHealthPoint } from "./normalize";
import { clampGoogleHealthRangeToConnection } from "./schedule";

export const GOOGLE_HEALTH_ACTIVE_HOURS_DATA_TYPES = ["steps", "activity-level"] as const satisfies readonly GoogleHealthDataType[];
export const GOOGLE_HEALTH_ACTIVE_HOURS_LOOKBACK_HOURS = 48;
export const GOOGLE_HEALTH_ACTIVE_HOURS_INTERVAL_MINUTES = 15;
export const GOOGLE_HEALTH_ACTIVE_HOURS_MAX_PAGES_PER_TYPE = 10;
export const GOOGLE_HEALTH_ACTIVE_HOURS_LOCK_TTL_MS = 90_000;
export const GOOGLE_HEALTH_ANALYSIS_LOCK_TTL_MS = 120_000;
export const GOOGLE_HEALTH_ACTIVE_HOURS_MARKER = "active_hours_last_synced_at";
export const GOOGLE_HEALTH_ACTIVE_HOURS_PROVENANCE = "google_health_active_hours_intraday";

type Connection = {
  id: string;
  user_id: string;
  status: string;
  scopes: string[] | null;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string | null;
  token_expires_at: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string;
};

type NormalizedRecord = ReturnType<typeof normalizeGoogleHealthPoint>;

type TimeoutQuery = {
  withTimeout?: (timeoutMs: number) => unknown;
  abortSignal?: (signal: AbortSignal) => unknown;
};

function withDeadline<T>(query: T, deadlineAt: number): T {
  const timeoutMs = Math.min(10_000, deadlineAt - Date.now() - 500);
  if (timeoutMs < 500) throw new Error("Google Health active-hours collection budget was reached.");
  const timeoutQuery = query as TimeoutQuery;
  if (typeof timeoutQuery.withTimeout === "function") return timeoutQuery.withTimeout(timeoutMs) as T;
  if (typeof timeoutQuery.abortSignal === "function") return timeoutQuery.abortSignal(AbortSignal.timeout(timeoutMs)) as T;
  return query;
}

function metadataObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function slotStart(now: Date) {
  const slot = new Date(now);
  slot.setUTCMinutes(Math.floor(slot.getUTCMinutes() / GOOGLE_HEALTH_ACTIVE_HOURS_INTERVAL_MINUTES) * GOOGLE_HEALTH_ACTIVE_HOURS_INTERVAL_MINUTES, 0, 0);
  return slot;
}

export function isGoogleHealthActiveHoursSyncDue(now: Date, lastSyncedAt: unknown) {
  if (typeof lastSyncedAt !== "string") return true;
  const lastSynced = Date.parse(lastSyncedAt);
  return !Number.isFinite(lastSynced) || lastSynced < slotStart(now).getTime();
}

export function googleHealthActiveHoursRange(now: Date) {
  const end = new Date(now);
  const start = new Date(end.getTime() - GOOGLE_HEALTH_ACTIVE_HOURS_LOOKBACK_HOURS * 60 * 60 * 1_000);
  return { start, end };
}

export function deduplicateGoogleHealthActiveHoursRecords(records: NormalizedRecord[]) {
  const bySourceRecordId = new Map<string, NormalizedRecord>();
  for (const record of records) bySourceRecordId.set(record.source_record_id, record);
  return [...bySourceRecordId.values()];
}

async function loadConnection(admin: ReturnType<typeof createCloudflareAdminClient>, connectionId: string, deadlineAt: number) {
  const query = withDeadline(admin.from("provider_connections")
    .select("id,user_id,status,scopes,access_token_ciphertext,refresh_token_ciphertext,token_expires_at,metadata,updated_at")
    .eq("id", connectionId)
    .eq("provider", "google_health"), deadlineAt);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error("Google Health active-hours connection could not be loaded.");
  return data as Connection | null;
}

async function accessToken(admin: ReturnType<typeof createCloudflareAdminClient>, connection: Connection, deadlineAt: number) {
  const expiresAt = connection.token_expires_at ? Date.parse(connection.token_expires_at) : 0;
  if (Number.isFinite(expiresAt) && expiresAt > Date.now() + 60_000) {
    return decryptSecret(connection.access_token_ciphertext);
  }
  if (!connection.refresh_token_ciphertext) throw new Error("Google Health refresh token is missing.");

  const timeoutMs = Math.min(10_000, deadlineAt - Date.now() - 1_000);
  if (timeoutMs < 1_000) throw new Error("Google Health active-hours collection budget was reached.");
  const tokens = await refreshGoogleHealthToken(decryptSecret(connection.refresh_token_ciphertext), { signal: AbortSignal.timeout(timeoutMs) });
  const update = withDeadline(admin.from("provider_connections").update({
    access_token_ciphertext: encryptSecret(tokens.access_token),
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1_000).toISOString(),
    status: "connected",
    updated_at: new Date().toISOString(),
  }).eq("id", connection.id), deadlineAt);
  const { error } = await update;
  if (error) throw new Error("Refreshed Google Health token could not be stored.");
  return tokens.access_token;
}

async function upsertIntradayPage(
  admin: ReturnType<typeof createCloudflareAdminClient>,
  userId: string,
  dataType: typeof GOOGLE_HEALTH_ACTIVE_HOURS_DATA_TYPES[number],
  points: Record<string, unknown>[],
  deadlineAt: number,
) {
  const normalized = deduplicateGoogleHealthActiveHoursRecords(points.map((point) => {
    const record = normalizeGoogleHealthPoint(userId, dataType, point);
    return {
      ...record,
      payload: {
        ...record.payload,
        soma: { provenance: GOOGLE_HEALTH_ACTIVE_HOURS_PROVENANCE },
      },
    };
  }));
  if (!normalized.length) return 0;
  const query = withDeadline(admin.from("health_records").upsert(normalized, {
    onConflict: "user_id,provider,data_type,source_record_id",
  }), deadlineAt);
  const { error } = await query;
  if (error) throw new Error("Google Health active-hours records could not be stored.");
  return normalized.length;
}

async function storeLastSyncedAt(
  admin: ReturnType<typeof createCloudflareAdminClient>,
  connectionId: string,
  syncedAt: string,
  deadlineAt: number,
) {
  // Compare-and-swap updated_at so a concurrent automatic sync's metadata
  // (for example an analytics backfill marker) is never overwritten.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const query = withDeadline(admin.from("provider_connections")
      .select("metadata,updated_at")
      .eq("id", connectionId), deadlineAt);
    const { data, error } = await query.maybeSingle();
    if (error || !data) throw new Error("Google Health active-hours freshness could not be loaded.");
    const metadata = metadataObject(data.metadata);
    const update = withDeadline(admin.from("provider_connections").update({
      metadata: { ...metadata, [GOOGLE_HEALTH_ACTIVE_HOURS_MARKER]: syncedAt },
      updated_at: new Date().toISOString(),
    }).eq("id", connectionId).eq("updated_at", data.updated_at).select("id"), deadlineAt);
    const result = await update.maybeSingle();
    if (result.error) throw new Error("Google Health active-hours freshness could not be stored.");
    if (result.data) return;
  }
  throw new Error("Google Health active-hours freshness changed too often to store.");
}

export type GoogleHealthActiveHoursResult = {
  status: "completed" | "skipped" | "locked";
  records: number;
  dataTypes: GoogleHealthDataType[];
};

export async function syncGoogleHealthActiveHoursConnection(
  connectionId: string,
  options: { now?: Date; collectionDeadlineAt?: number; deadlineAt?: number } = {},
): Promise<GoogleHealthActiveHoursResult> {
  const now = options.now ?? new Date();
  const deadlineAt = options.deadlineAt ?? Date.now() + 48_000;
  const collectionDeadlineAt = options.collectionDeadlineAt ?? options.deadlineAt ?? deadlineAt - 22_000;
  const admin = createCloudflareAdminClient();
  let connection = await loadConnection(admin, connectionId, collectionDeadlineAt);
  if (!connection || connection.status !== "connected") return { status: "skipped", records: 0, dataTypes: [] };
  if (!isGoogleHealthActiveHoursSyncDue(now, metadataObject(connection.metadata)[GOOGLE_HEALTH_ACTIVE_HOURS_MARKER])) {
    return { status: "skipped", records: 0, dataTypes: [] };
  }

  const lockKey = `google-health-active-hours:${connection.id}`;
  const lockUserId = connection.user_id;
  if (!await claimCloudflareLock(lockKey, lockUserId, GOOGLE_HEALTH_ACTIVE_HOURS_LOCK_TTL_MS)) {
    return { status: "locked", records: 0, dataTypes: [] };
  }

  try {
    connection = await loadConnection(admin, connectionId, collectionDeadlineAt);
    if (!connection || connection.status !== "connected") return { status: "skipped", records: 0, dataTypes: [] };
    if (!isGoogleHealthActiveHoursSyncDue(now, metadataObject(connection.metadata)[GOOGLE_HEALTH_ACTIVE_HOURS_MARKER])) {
      return { status: "skipped", records: 0, dataTypes: [] };
    }

    const granted = new Set(getGrantedGoogleHealthDataTypes(connection.scopes ?? []));
    const dataTypes = GOOGLE_HEALTH_ACTIVE_HOURS_DATA_TYPES.filter((dataType) => granted.has(dataType));
    const boundedRange = googleHealthActiveHoursRange(now);
    const range = clampGoogleHealthRangeToConnection({
      start: boundedRange.start.toISOString(),
      end: boundedRange.end.toISOString(),
    }, connection.metadata);
    const rangeStart = new Date(range.start);
    const rangeEnd = new Date(range.end);
    let records = 0;

    if (dataTypes.length && rangeStart < rangeEnd) {
      const token = await accessToken(admin, connection, collectionDeadlineAt);
      for (const dataType of dataTypes) {
        let pageToken: string | undefined;
        let pageCount = 0;
        do {
          const timeoutMs = Math.min(10_000, collectionDeadlineAt - Date.now() - 1_000);
          if (timeoutMs < 1_000) throw new Error("Google Health active-hours collection budget was reached.");
          const response = await listGoogleHealthDataPoints({
            accessToken: token,
            dataType,
            start: rangeStart,
            end: rangeEnd,
            signal: AbortSignal.timeout(timeoutMs),
            ...(pageToken ? { pageToken } : {}),
          });
          records += await upsertIntradayPage(admin, connection.user_id, dataType, response.dataPoints ?? [], collectionDeadlineAt);
          pageCount += 1;
          pageToken = response.nextPageToken;
          if (pageToken && pageCount >= GOOGLE_HEALTH_ACTIVE_HOURS_MAX_PAGES_PER_TYPE) {
            throw new Error("Google Health active-hours page budget was reached.");
          }
        } while (pageToken);
      }

      if (records > 0) {
        const analysisLockKey = `health-analysis:${connection.user_id}`;
        if (Date.now() >= deadlineAt - 1_000) throw new Error("Google Health active-hours worker budget was reached before analysis.");
        if (!await claimCloudflareLock(analysisLockKey, connection.user_id, GOOGLE_HEALTH_ANALYSIS_LOCK_TTL_MS)) {
          throw new Error("Health analysis is already in progress.");
        }
        try {
          await recomputeUserHealth(connection.user_id, { windowDays: 45 });
        } finally {
          try {
            await releaseCloudflareLock(analysisLockKey, connection.user_id);
          } catch {
            console.error("[google-health-active-hours] analysis lock release failed");
          }
        }
      }
    }

    await storeLastSyncedAt(admin, connection.id, new Date().toISOString(), deadlineAt);
    return { status: "completed", records, dataTypes };
  } finally {
    try {
      await releaseCloudflareLock(lockKey, lockUserId);
    } catch {
      console.error("[google-health-active-hours] lock release failed");
    }
  }
}
