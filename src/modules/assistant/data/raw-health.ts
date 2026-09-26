import "server-only";

import { z } from "zod";
import { GOOGLE_HEALTH_DATA_TYPES, GOOGLE_HEALTH_DAILY_ROLLUP_TYPES } from "@/integrations/google-health/client";
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
// Match the ordinal string order used by the storage adapter, including opaque IDs.
function comparePositions(first: string, second: string) { return first < second ? -1 : first > second ? 1 : 0; }
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
  const hasCivilRecords = dataType.startsWith("daily-")
    || (GOOGLE_HEALTH_DAILY_ROLLUP_TYPES as readonly string[]).includes(dataType);
  // A rollup type may also contain historical hourly points. Read disjoint,
  // bounded streams instead of choosing one timestamp column for the type.
  const fields = ["measured_at", "start_time", ...(hasCivilRecords ? ["civil_date"] : [])] as const;
  const separator = after?.indexOf("|") ?? -1;
  const afterTime = after && separator >= 0 ? after.slice(0, separator) : null;
  const afterId = after && separator >= 0 ? after.slice(separator + 1) : null;
  const readStream = async (dateField: typeof fields[number]) => {
    const civil = dateField === "civil_date";
    const lower = civil ? from.slice(0, 10) : from;
    const upper = civil ? utcDayRange(new Date(Date.parse(to) - 1)).end.slice(0, 10) : to;
    const base = () => {
      let builder = admin.from("health_records").select("source_record_id,measured_at,start_time,end_time,civil_date,payload")
        .eq("user_id", userId).eq("provider", "google_health").eq("data_type", dataType);
      if (dateField !== "measured_at") builder = builder.is("measured_at", null);
      if (civil) builder = builder.is("start_time", null);
      return builder.gte(dateField, lower).lt(dateField, upper)
        .order(dateField, { ascending: true }).order("source_record_id", { ascending: true });
    };
    const civilTime = `${lower}T00:00:00.000Z`;
    // Civil rows belong to midnight. Once a cursor has passed it, there is
    // nothing left in this day's civil stream, even if hourly rows remain.
    if (civil && (Date.parse(civilTime) < Date.parse(from) || (afterTime && comparePositions(civilTime, afterTime) < 0))) return [];
    const bound = civil ? (afterTime && civilTime === afterTime ? lower : null) : afterTime;
    const [later, tied] = await Promise.all([
      (bound ? base().gt(dateField, bound) : base()).limit(limit + 1),
      bound ? base().eq(dateField, bound).gt("source_record_id", afterId).limit(limit + 1)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (later.error || tied.error) throw new Error("Raw health records could not be loaded.");
    return [...(tied.data ?? []), ...(later.data ?? [])] as RawRow[];
  };
  const [streams, archiveResult] = await Promise.all([
    Promise.all(fields.map(readStream)),
    admin.from("health_record_archives")
      .select("user_id,provider,data_type,range_start,range_end,object_path,storage_backend,row_count,content_sha256,object_sha256,reclaimed_at")
      .eq("user_id", userId).eq("provider", "google_health").eq("data_type", dataType)
      .lt("range_start", to).gt("range_end", from),
  ]);
  if (archiveResult.error) throw new Error("Raw health records could not be loaded.");
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
  const rows = [...archived, ...streams.flat()].filter((row) => {
    const time = timestamp(row);
    return time && Date.parse(time) >= Date.parse(from) && Date.parse(time) < Date.parse(to) && (!after || comparePositions(position(row), after) > 0);
  });
  const unique = [...new Map(rows.map((row) => [position(row), row])).values()].sort((a, b) => comparePositions(position(a), position(b)));
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
      startTime: row.start_time ?? null, endTime: row.end_time ?? null, civilDate: row.civil_date ?? null,
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
