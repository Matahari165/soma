import "server-only";
import { abortable } from "@/lib/abortable";

import { resolveMaximumHeartRate } from "@/domain/health/heart-rate-zones";
import { decodeHealthArchive } from "@/domain/health/archive-codec";
import {
  calculateActivitySessionTelemetry,
  type ActivitySessionTelemetry,
} from "@/domain/health/activity-session-telemetry";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getR2ArchiveObject } from "@/lib/r2";
import { GOOGLE_HEALTH_SCOPES, refreshGoogleHealthToken, rollUpGoogleHealthSessionHeartRate } from "@/integrations/google-health/client";
import { normalizeGoogleHealthPoint } from "@/integrations/google-health/normalize";
import {
  fetchGoogleHealthSessionHeartRate,
} from "@/integrations/google-health/session-heart-rate";

const PAGE_SIZE = 1_000;

export type SessionTelemetryOptions = {
  signal?: AbortSignal;
  heartRatePageToken?: string;
  skipHeartRateFetch?: boolean;
  onHeartRatePage?: (nextPageToken: string | null) => Promise<void>;
};

type SessionRange = { startTime: string; endTime: string; date?: string | null };
type HealthRow = {
  source_record_id?: string | null;
  civil_date?: string | null;
  measured_at?: string | null;
  payload?: unknown;
};
type ArchiveManifest = {
  user_id: string;
  provider: string;
  data_type: string;
  range_start: string;
  range_end: string;
  object_path: string;
  storage_backend: string;
  row_count: number;
  content_sha256: string;
  object_sha256: string;
  reclaimed_at: string | null;
};
type GoogleHealthConnection = {
  id: string;
  status: string;
  scopes: string[] | null;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string | null;
  token_expires_at: string | null;
};

function validRange(range: SessionRange) {
  const start = Date.parse(range.startTime);
  const end = Date.parse(range.endTime);
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

async function readLiveHeartRateRows(userId: string, startTime: string, endTime: string, signal?: AbortSignal): Promise<HealthRow[]> {
  const admin = createCloudflareAdminClient();
  const rows: HealthRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    signal?.throwIfAborted();
    const result = await abortable(admin.from("health_records")
      .select("source_record_id,civil_date,measured_at,payload")
      .eq("user_id", userId)
      .eq("provider", "google_health")
      .eq("data_type", "heart-rate")
      .gte("measured_at", startTime)
      .lte("measured_at", endTime)
      .order("measured_at", { ascending: true })
      .order("source_record_id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1), signal);
    if (result.error) throw new Error("Session heart-rate data could not be loaded.");
    const page = (result.data ?? []) as HealthRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function readArchiveManifests(userId: string, startTime: string, endTime: string): Promise<ArchiveManifest[]> {
  const result = await createCloudflareAdminClient().from("health_record_archives")
    .select("user_id,provider,data_type,range_start,range_end,object_path,storage_backend,row_count,content_sha256,object_sha256,reclaimed_at")
    .eq("user_id", userId)
    .eq("provider", "google_health")
    .eq("data_type", "heart-rate")
    .lt("range_start", endTime)
    .gt("range_end", startTime);
  if (result.error) throw new Error("Session heart-rate archives could not be listed.");
  return (result.data ?? []) as ArchiveManifest[];
}

async function readR2ArchiveRows(userId: string, manifests: ArchiveManifest[], startTime: string, endTime: string): Promise<HealthRow[]> {
  const overlapping = manifests.filter((manifest) => {
    if (manifest.storage_backend === "r2") return true;
    // Legacy Supabase-backed archives are safe to ignore while the source rows
    // remain live, but reclaimed rows cannot be read through the R2 helper.
    if (manifest.reclaimed_at) throw new Error("Session heart-rate archive storage is unavailable.");
    return false;
  });
  const archives = await Promise.all(overlapping.map(async (manifest) => {
    let decoded: Awaited<ReturnType<typeof decodeHealthArchive>>;
    try {
      decoded = await decodeHealthArchive(await getR2ArchiveObject(manifest.object_path));
    } catch {
      throw new Error("Session heart-rate archive could not be read.");
    }
    const header = decoded.header;
    const matches = decoded.rows.length === manifest.row_count
      && decoded.contentSha256 === manifest.content_sha256
      && decoded.objectSha256 === manifest.object_sha256
      && header.userId === userId
      && header.provider === "google_health"
      && header.dataType === "heart-rate"
      && Date.parse(String(header.rangeStart)) === Date.parse(manifest.range_start)
      && Date.parse(String(header.rangeEnd)) === Date.parse(manifest.range_end);
    if (!matches) throw new Error("Session heart-rate archive verification failed.");
    return decoded.rows as HealthRow[];
  }));
  const start = Date.parse(startTime);
  const end = Date.parse(endTime);
  return archives.flat().filter((row) => {
    const measuredAt = row.measured_at ? Date.parse(row.measured_at) : Number.NaN;
    return Number.isFinite(measuredAt) && measuredAt >= start && measuredAt <= end;
  });
}

async function readExercisePayloads(userId: string, startTime: string, endTime: string) {
  const start = Date.parse(startTime);
  const end = Date.parse(endTime);
  const result = await createCloudflareAdminClient().from("health_records")
    .select("start_time,end_time,payload")
    .eq("user_id", userId)
    .eq("provider", "google_health")
    .eq("data_type", "exercise")
    .gte("start_time", new Date(start - 1_000).toISOString())
    .lte("start_time", new Date(start + 1_000).toISOString())
    .gte("end_time", new Date(end - 1_000).toISOString())
    .lte("end_time", new Date(end + 1_000).toISOString())
    .limit(5);
  if (result.error) throw new Error("Session pause events could not be loaded.");
  return (result.data ?? []).flatMap((row) => {
    const rowStart = Date.parse(String(row.start_time ?? ""));
    const rowEnd = Date.parse(String(row.end_time ?? ""));
    return Math.abs(rowStart - start) <= 1_000 && Math.abs(rowEnd - end) <= 1_000 ? [row.payload] : [];
  });
}

async function readSessionProfile(userId: string) {
  const result = await createCloudflareAdminClient().from("profiles")
    .select("timezone,date_of_birth,maximum_heart_rate_bpm").eq("user_id", userId).maybeSingle();
  if (result.error) throw new Error("Session timezone could not be loaded.");
  return {
    timeZone: typeof result.data?.timezone === "string" ? result.data.timezone : "Europe/Paris",
    dateOfBirth: typeof result.data?.date_of_birth === "string" ? result.data.date_of_birth : null,
    personalBpm: result.data?.maximum_heart_rate_bpm,
  };
}

function deduplicateRows(rows: HealthRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const measuredAt = typeof row.measured_at === "string" ? row.measured_at : "";
    const identity = row.source_record_id
      ? `id:${row.source_record_id}`
      : `sample:${measuredAt}:${JSON.stringify(row.payload)}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

async function googleHealthAccessToken(userId: string, signal?: AbortSignal): Promise<string | null> {
  const admin = createCloudflareAdminClient();
  const result = await admin.from("provider_connections")
    .select("id,status,scopes,access_token_ciphertext,refresh_token_ciphertext,token_expires_at")
    .eq("user_id", userId)
    .eq("provider", "google_health")
    .maybeSingle();
  if (result.error) throw new Error("Google Health session connection could not be loaded.");
  const connection = result.data as GoogleHealthConnection | null;
  if (!connection || connection.status !== "connected") return null;
  if (!(connection.scopes ?? []).includes(GOOGLE_HEALTH_SCOPES[1])) return null;

  const expiresAt = connection.token_expires_at ? Date.parse(connection.token_expires_at) : 0;
  if (expiresAt > Date.now() + 60_000) return decryptSecret(connection.access_token_ciphertext);
  if (!connection.refresh_token_ciphertext) return null;

  signal?.throwIfAborted();
  const tokens = await abortable(refreshGoogleHealthToken(decryptSecret(connection.refresh_token_ciphertext), { signal }), signal);
  signal?.throwIfAborted();
  const refreshed = await abortable(admin.from("provider_connections").update({
    access_token_ciphertext: encryptSecret(tokens.access_token),
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1_000).toISOString(),
    status: "connected",
    last_error_code: null,
  }).eq("id", connection.id), signal);
  signal?.throwIfAborted();
  if (refreshed.error) throw new Error("Google Health session token could not be refreshed.");
  return tokens.access_token;
}

async function fetchAndStoreSessionHeartRate(userId: string, startTime: string, endTime: string, accessToken: string, options: SessionTelemetryOptions) {
  const start = Date.parse(startTime);
  const end = Date.parse(endTime);
  const admin = createCloudflareAdminClient();
  const matchingRows = (points: Record<string, unknown>[]) => points.map((point) => normalizeGoogleHealthPoint(userId, "heart-rate", point)).filter((row) => {
    const measuredAt = row.measured_at ? Date.parse(row.measured_at) : Number.NaN;
    return Number.isFinite(measuredAt) && measuredAt >= start && measuredAt <= end;
  });
  let persistedPages = false;
  const persistPage = async (points: Record<string, unknown>[], nextPageToken: string | null) => {
    options.signal?.throwIfAborted();
    const rows = matchingRows(points);
    for (let offset = 0; offset < rows.length; offset += 500) {
      options.signal?.throwIfAborted();
      const result = await abortable(admin.from("health_records").upsert(rows.slice(offset, offset + 500), {
        onConflict: "user_id,provider,data_type,source_record_id",
      }), options.signal);
      if (result.error) throw new Error("Google Health session heart-rate data could not be stored.");
    }
    options.signal?.throwIfAborted();
    if (options.onHeartRatePage) await options.onHeartRatePage(nextPageToken);
    persistedPages = true;
  };
  const fetched = await fetchGoogleHealthSessionHeartRate({
    accessToken, start: new Date(startTime), end: new Date(endTime),
    signal: options.signal, pageToken: options.heartRatePageToken, onPage: persistPage,
  });
  // Retains compatibility with injected readers that return a complete result directly.
  if (!persistedPages) await persistPage(fetched.dataPoints, null);
  const matching = matchingRows(fetched.dataPoints);
  return {
    records: matching.map((row) => ({ source_record_id: row.source_record_id, civil_date: row.civil_date,
      measured_at: row.measured_at, payload: row.payload })),
    limited: fetched.limited,
    status: matching.length ? "fetched" as const : "empty" as const,
  };
}

/**
 * Loads only the selected exercise window from live Google Health records and
 * overlapping verified R2 heart-rate archives, then derives session telemetry.
 */
export async function getActivitySessionTelemetry(
  userId: string,
  range: SessionRange,
  options: SessionTelemetryOptions = {},
): Promise<ActivitySessionTelemetry> {
  if (!userId || !validRange(range)) throw new Error("Activity session telemetry requires a valid time range.");
  const startTime = new Date(range.startTime).toISOString();
  const endTime = new Date(range.endTime).toISOString();
  options.signal?.throwIfAborted();
  const [liveRows, manifests, exercisePayloads, profile] = await abortable(Promise.all([
    readLiveHeartRateRows(userId, startTime, endTime, options.signal),
    readArchiveManifests(userId, startTime, endTime),
    readExercisePayloads(userId, startTime, endTime),
    readSessionProfile(userId),
  ]), options.signal);
  const { timeZone } = profile;
  let localDate: string;
  try {
    localDate = new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(startTime));
  } catch {
    localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(startTime));
  }
  const maximumHeartRate = resolveMaximumHeartRate({ ...profile, date: localDate });
  const archivedRows = await abortable(readR2ArchiveRows(userId, manifests, startTime, endTime), options.signal);
  options.signal?.throwIfAborted();
  let heartRateRecords = deduplicateRows([...liveRows, ...archivedRows]).map((row) => ({
    sourceRecordId: row.source_record_id,
    measuredAt: row.measured_at ?? null,
    civilDate: row.civil_date ?? null,
    payload: row.payload,
  }));
  let telemetry = calculateActivitySessionTelemetry({
    startTime,
    endTime,
    heartRateRecords,
    maximumHeartRate,
    exercisePayloads,
  });
  let heartRateSampleSource: ActivitySessionTelemetry["heartRateSampleSource"] = telemetry.heartRateSampleCount ? "health_records" : "none";
  let heartRateFetchLimited = false;
  let heartRateFetchStatus: ActivitySessionTelemetry["heartRateFetchStatus"] = telemetry.heartRateSampleCount ? "not_needed" : "unavailable";
  let accessToken: string | null = null;
  // A partial daily import is not a complete workout trace. Ask Google for
  // missing coverage too, while keeping every previously imported sample.
  if (!options.skipHeartRateFetch && (options.heartRatePageToken || !telemetry.heartRateSampleCount || telemetry.coverage.gapCount > 0)) {
    try {
      accessToken = await abortable(googleHealthAccessToken(userId, options.signal), options.signal);
      if (!accessToken) {
        heartRateFetchStatus = "unavailable";
      } else {
        const fetched = await fetchAndStoreSessionHeartRate(userId, startTime, endTime, accessToken, options);
        heartRateFetchLimited = fetched.limited;
        heartRateFetchStatus = fetched.records.length ? "fetched" : "empty";
        if (fetched.records.length) {
          const combined = deduplicateRows([
            ...heartRateRecords.map((row) => ({
              source_record_id: row.sourceRecordId,
              measured_at: row.measuredAt,
              civil_date: row.civilDate,
              payload: row.payload,
            })),
            ...fetched.records,
          ]);
          heartRateRecords = combined.map((row) => ({
            sourceRecordId: row.source_record_id,
            measuredAt: row.measured_at ?? null,
            civilDate: row.civil_date ?? null,
            payload: row.payload,
          }));
          telemetry = calculateActivitySessionTelemetry({
            startTime, endTime,
            heartRateRecords, maximumHeartRate, exercisePayloads,
          });
          heartRateSampleSource = telemetry.heartRateSampleCount ? "google_health_api" : "none";
          if (!telemetry.heartRateSampleCount) heartRateFetchStatus = "empty";
        }
      }
    } catch (error) {
      if (options.signal?.aborted || options.onHeartRatePage) throw error;
      heartRateFetchStatus = "failed";
    }
  }
  const result = calculateActivitySessionTelemetry({
    startTime,
    endTime,
    heartRateRecords,
    maximumHeartRate,
    exercisePayloads,
    heartRateSampleSource,
    heartRateFetchLimited,
    heartRateFetchStatus,
  });
  result.maxHeartRateSource = result.maxHeartRateBpm === null ? "none" : "recorded_samples";
  try {
    accessToken ??= await abortable(googleHealthAccessToken(userId, options.signal), options.signal);
    if (accessToken) {
      const rollup = await abortable(rollUpGoogleHealthSessionHeartRate({ accessToken, start: new Date(startTime), end: new Date(endTime), signal: options.signal }), options.signal);
      const maximum = rollup.rollupDataPoints?.[0]?.heartRate?.beatsPerMinuteMax;
      if (typeof maximum === "number" && Number.isFinite(maximum) && maximum > 0 && maximum <= 300) {
        result.maxHeartRateBpm = maximum;
        result.maxHeartRateSource = "google_health_rollup";
      }
    }
  } catch (error) {
    if (options.signal?.aborted) throw error;
    // The recorded sample maximum remains available if the rollup is unavailable.
  }
  options.signal?.throwIfAborted();
  return result;
}
