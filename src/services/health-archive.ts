import "server-only";

import { decodeHealthArchive, encodeHealthArchive, utcDayRange } from "@/domain/health/archive-codec";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { getR2ArchiveObject, putR2ArchiveObject, r2ArchiveBucket } from "@/lib/r2";

const PAGE_SIZE = 1_000;
const PAGE_CONCURRENCY = 4;
export const RAW_HEART_RATE_LIVE_DAYS = 7;

type HealthArchiveManifest = {
  id: string;
  user_id: string;
  provider: string;
  data_type: string;
  range_start: string;
  range_end: string;
  object_path: string;
  storage_backend: "r2";
  storage_bucket: string;
  row_count: number;
  content_sha256: string;
  object_sha256: string;
  reclaimed_at: string | null;
};

function objectPath(userId: string, rangeStart: string) {
  const date = rangeStart.slice(0, 10);
  return `${userId}/heart-rate/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}.jsonl.gz`;
}

async function fetchHeartRateDay(userId: string, rangeStart: string, rangeEnd: string) {
  const admin = createCloudflareAdminClient();
  const base = (count = false) => admin.from("health_records").select("*", count ? { count: "exact" } : {})
    .eq("user_id", userId)
    .eq("provider", "google_health")
    .eq("data_type", "heart-rate")
    .gte("measured_at", rangeStart)
    .lt("measured_at", rangeEnd)
    .order("measured_at", { ascending: true })
    .order("id", { ascending: true });
  const first = await base(true).range(0, PAGE_SIZE - 1);
  if (first.error) throw new Error("Heart-rate archive source could not be read.");
  const rows = [...((first.data ?? []) as Array<Record<string, unknown>>)].map((row) => ({ ...row }));
  const total = first.count ?? rows.length;
  const offsets: number[] = [];
  for (let from = PAGE_SIZE; from < total; from += PAGE_SIZE) offsets.push(from);
  for (let index = 0; index < offsets.length; index += PAGE_CONCURRENCY) {
    const pages = await Promise.all(offsets.slice(index, index + PAGE_CONCURRENCY).map((from) => base().range(from, from + PAGE_SIZE - 1)));
    for (const page of pages) {
      if (page.error) throw new Error("Heart-rate archive source page could not be read.");
      rows.push(...((page.data ?? []) as Array<Record<string, unknown>>));
    }
  }
  return rows;
}

async function verifyR2Object(manifest: Pick<HealthArchiveManifest, "object_path" | "row_count" | "content_sha256" | "object_sha256" | "range_start" | "range_end">) {
  const decoded = await decodeHealthArchive(await getR2ArchiveObject(manifest.object_path));
  const matches = decoded.rows.length === manifest.row_count
    && decoded.contentSha256 === manifest.content_sha256
    && decoded.objectSha256 === manifest.object_sha256
    && Date.parse(String(decoded.header.rangeStart)) === Date.parse(manifest.range_start)
    && Date.parse(String(decoded.header.rangeEnd)) === Date.parse(manifest.range_end);
  if (!matches) throw new Error(`R2 archive verification failed: ${manifest.object_path}.`);
}

export async function archiveNextEligibleHeartRateDay(now = new Date()) {
  const admin = createCloudflareAdminClient();
  const cutoffDate = new Date(now);
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - RAW_HEART_RATE_LIVE_DAYS);
  cutoffDate.setUTCHours(0, 0, 0, 0);
  const cutoff = cutoffDate.toISOString();
  const { data: oldest, error: oldestError } = await admin.from("health_records").select("user_id,measured_at")
    .eq("provider", "google_health").eq("data_type", "heart-rate").lt("measured_at", cutoff)
    .order("measured_at", { ascending: true }).limit(1).maybeSingle();
  if (oldestError) throw new Error("Oldest heart-rate record could not be loaded.");
  if (!oldest) return null;
  const userId = String(oldest.user_id);
  const { start, end } = utcDayRange(String(oldest.measured_at));
  const { data: existing, error: existingError } = await admin.from("health_record_archives").select("*")
    .eq("user_id", userId).eq("provider", "google_health").eq("data_type", "heart-rate")
    .eq("range_start", start).eq("range_end", end).maybeSingle();
  if (existingError) throw new Error("Existing health archive manifest could not be loaded.");
  if (existing) {
    await verifyR2Object(existing as HealthArchiveManifest);
    return null;
  }
  const rows = await fetchHeartRateDay(userId, start, end);
  if (!rows.length) return null;
  const archive = await encodeHealthArchive({ userId, provider: "google_health", dataType: "heart-rate", rangeStart: start, rangeEnd: end, rows });
  const path = objectPath(userId, start);
  await putR2ArchiveObject(path, archive.object);
  const copied = await decodeHealthArchive(await getR2ArchiveObject(path));
  if (copied.rows.length !== rows.length || copied.contentSha256 !== archive.contentSha256 || copied.objectSha256 !== archive.objectSha256) {
    throw new Error(`New R2 archive verification failed: ${path}.`);
  }
  const first = rows[0];
  const last = rows.at(-1) as Record<string, unknown>;
  const { data: stored, error: storeError } = await admin.from("health_record_archives").upsert({
      user_id: userId,
      provider: "google_health",
      data_type: "heart-rate",
      range_start: start,
      range_end: end,
      object_path: path,
      storage_backend: "r2",
      storage_bucket: r2ArchiveBucket(),
      row_count: rows.length,
      uncompressed_bytes: archive.content.length,
      compressed_bytes: archive.object.length,
      content_sha256: archive.contentSha256,
      object_sha256: archive.objectSha256,
      first_source_record_id: String(first.source_record_id),
      last_source_record_id: String(last.source_record_id),
      verified_at: new Date().toISOString(),
  }, { onConflict: "user_id,provider,data_type,range_start,range_end" }).select("*").single();
  if (storeError || !stored) throw new Error("Health archive manifest could not be stored.");
  const manifest = stored as HealthArchiveManifest;
  await verifyR2Object(manifest);
  return { archiveId: manifest.id, objectPath: manifest.object_path, rowCount: manifest.row_count, retainedRows: manifest.row_count };
}
