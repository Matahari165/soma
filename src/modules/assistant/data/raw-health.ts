import "server-only";

import { z } from "zod";
import { GOOGLE_HEALTH_DATA_TYPES } from "@/integrations/google-health/client";
import { decodeHealthArchive, utcDayRange } from "@/domain/health/archive-codec";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { getR2ArchiveObject } from "@/lib/r2";
import { queryFingerprint, readScopedCursor, signScopedCursor } from "./scoped-cursor";

export const assistantRawHealthSchema = z.object({
  dataType: z.enum(GOOGLE_HEALTH_DATA_TYPES),
  period: z.object({ from: z.iso.datetime({ offset: true }), to: z.iso.datetime({ offset: true }) })
    .refine((range) => Date.parse(range.from) < Date.parse(range.to), "The range must be increasing."),
  limit: z.number().int().min(1).max(200).default(100),
  cursor: z.string().max(8192).nullable().default(null),
}).strict();

type RawRow = { source_record_id?: string; measured_at?: string | null; start_time?: string | null; end_time?: string | null; civil_date?: string | null; payload?: unknown };
type RawCursor = { day: string; after: string | null };
type ArchiveManifest = {
  user_id: string; provider: string; data_type: string; range_start: string; range_end: string;
  object_path: string; storage_backend: string; row_count: number; content_sha256: string; object_sha256: string; reclaimed_at?: string | null;
};
type ReadDay = { rows: RawRow[]; hasMore: boolean; archivesIncluded: boolean };

function timestamp(row: RawRow) { return row.measured_at ?? row.start_time ?? (row.civil_date ? `${row.civil_date}T00:00:00.000Z` : null); }
function position(row: RawRow) { return `${timestamp(row) ?? ""}|${row.source_record_id ?? ""}`; }

// Keep health payloads, excluding internal identifiers/credentials even if a source adds them.
export function safeHealthPayload(value: unknown, depth = 0): unknown {
  if (depth > 12) return { omitted: "maximum_nesting" };
  if (Array.isArray(value)) return value.map((item) => safeHealthPayload(item, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/(?:token|secret|password|credential|user.?id|email|authorization|object.?path)/iu.test(key))
    .map(([key, item]) => [key, safeHealthPayload(item, depth + 1)]));
  return value;
}

async function readRawDay(userId: string, dataType: string, from: string, to: string, after: string | null, limit: number): Promise<ReadDay> {
  const admin = createCloudflareAdminClient();
  const daily = dataType.startsWith("daily-");
  const dateField = daily ? "civil_date" : "measured_at";
  const lower = daily ? from.slice(0, 10) : from;
  const upper = daily ? utcDayRange(new Date(Date.parse(to) - 1)).end.slice(0, 10) : to;
  const base = () => admin.from("health_records").select("source_record_id,measured_at,start_time,end_time,civil_date,payload")
    .eq("user_id", userId).eq("provider", "google_health").eq("data_type", dataType)
    .gte(dateField, lower).lt(dateField, upper).order(dateField, { ascending: true }).order("source_record_id", { ascending: true });
  const [afterTime, afterId] = after ? after.split("|") : [];
  const bound = daily ? afterTime?.slice(0, 10) : afterTime;
  const live = bound ? base().gt(dateField, bound) : base();
  const [liveResult, tiedResult, archiveResult] = await Promise.all([
    live.limit(limit + 1),
    bound ? base().eq(dateField, bound).gt("source_record_id", afterId).limit(limit + 1) : Promise.resolve({ data: [], error: null }),
    admin.from("health_record_archives")
      .select("user_id,provider,data_type,range_start,range_end,object_path,storage_backend,row_count,content_sha256,object_sha256,reclaimed_at")
      .eq("user_id", userId).eq("provider", "google_health").eq("data_type", dataType)
      .lt("range_start", to).gt("range_end", from),
  ]);
  if (liveResult.error || tiedResult.error || archiveResult.error) throw new Error("Raw health records could not be loaded.");
  const archived: RawRow[] = [];
  for (const manifest of (archiveResult.data ?? []) as ArchiveManifest[]) {
    if (manifest.storage_backend !== "r2") {
      if (manifest.reclaimed_at) throw new Error("The required health archive is unavailable.");
      continue;
    }
    const decoded = await decodeHealthArchive(await getR2ArchiveObject(manifest.object_path));
    if (decoded.header.userId !== userId || decoded.header.provider !== "google_health" || decoded.header.dataType !== dataType
      || decoded.rows.length !== manifest.row_count || decoded.contentSha256 !== manifest.content_sha256
      || decoded.objectSha256 !== manifest.object_sha256
      || Date.parse(String(decoded.header.rangeStart)) !== Date.parse(manifest.range_start)
      || Date.parse(String(decoded.header.rangeEnd)) !== Date.parse(manifest.range_end)) throw new Error("Health archive integrity verification failed.");
    archived.push(...decoded.rows as RawRow[]);
  }
  const rows = [...archived, ...((tiedResult.data ?? []) as RawRow[]), ...((liveResult.data ?? []) as RawRow[])].filter((row) => {
    const time = timestamp(row);
    return time && Date.parse(time) >= Date.parse(from) && Date.parse(time) < Date.parse(to) && (!after || position(row) > after);
  });
  const unique = [...new Map(rows.map((row) => [position(row), row])).values()].sort((a, b) => position(a).localeCompare(position(b)));
  return { rows: unique.slice(0, limit), hasMore: unique.length > limit, archivesIncluded: archived.length > 0 };
}

export async function queryAssistantRawHealth(userId: string, input: unknown, options: {
  readDay?: typeof readRawDay; cursorSecret?: string;
} = {}) {
  if (!userId) throw new Error("Authenticated user is required.");
  const query = assistantRawHealthSchema.parse(input);
  const range = { from: new Date(query.period.from).toISOString(), to: new Date(query.period.to).toISOString() };
  if (Date.parse(range.to) - Date.parse(range.from) > 3660 * 86_400_000) throw new Error("Raw health ranges are limited to 3660 days.");
  const scope = queryFingerprint(userId, { raw: query.dataType, range });
  const cursor = query.cursor ? readScopedCursor<RawCursor>(query.cursor, scope, options.cursorSecret) : { day: range.from, after: null };
  if (!cursor || typeof cursor.day !== "string" || (cursor.after !== null && typeof cursor.after !== "string")
    || Date.parse(cursor.day) < Date.parse(range.from) || Date.parse(cursor.day) >= Date.parse(range.to)) throw new Error("Invalid raw health cursor.");
  // One partition per call. Empty partitions still return a cursor, not a false exhaustive result.
  const from = new Date(cursor.day).toISOString();
  const to = new Date(Math.min(Date.parse(utcDayRange(from).end), Date.parse(range.to))).toISOString();
  const page = await (options.readDay ?? readRawDay)(userId, query.dataType, from, to, cursor.after, query.limit);
  let next: RawCursor | null = null;
  if (page.hasMore && page.rows.length) next = { day: from, after: position(page.rows.at(-1)!) };
  else if (to < range.to) next = { day: to, after: null };
  let payloadBudget = 64_000;
  const items = page.rows.map((row) => {
    const payload = safeHealthPayload(row.payload);
    const json = JSON.stringify(payload);
    const payloadComplete = json !== undefined && json.length <= 12_000 && json.length <= payloadBudget;
    if (payloadComplete) payloadBudget -= json!.length;
    return { recordId: row.source_record_id ?? null, measuredAt: row.measured_at ?? null,
      startTime: row.start_time ?? null, endTime: row.end_time ?? null,
      payload: payloadComplete ? payload : { omitted: "large_payload", retrieveActivityTelemetry: query.dataType === "exercise" },
      payloadComplete };
  });
  return {
    items,
    manifest: { dataset: "raw_health", dataType: query.dataType, provider: "google_health",
      requestedPeriod: range, scannedPeriod: { from, to }, returnedItems: items.length,
      totalItems: null, hasMore: Boolean(next), nextCursor: next ? signScopedCursor(scope, next, options.cursorSecret) : null,
      complete: !next, payloadsComplete: items.every((item) => item.payloadComplete), archivesIncluded: page.archivesIncluded,
      generatedAt: new Date().toISOString() },
    note: "Données sources, distinctes des métriques quotidiennes et des zones calculées par Soma. Les partitions archivées sont décodées uniquement lorsqu'elles chevauchent la période. Les champs volumineux omis sont signalés, jamais présentés comme complets.",
  };
}
