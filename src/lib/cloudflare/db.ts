import "server-only";

/* eslint-disable @typescript-eslint/no-explicit-any -- This compatibility layer deliberately mirrors Supabase's dynamic query API. */

import { getCloudflareContext } from "@opennextjs/cloudflare";

type Row = any;
type CloudflareError = { message: string; code?: string; details?: string; hint?: string };
type QueryResult<T> = { data: T; error: CloudflareError | null; count?: number | null };
type ManyResult = QueryResult<any[] | null>;
type SingleResult = QueryResult<any | null>;
type Filter = {
  field: string;
  operator: "eq" | "neq" | "in" | "is" | "gte" | "gt" | "lte" | "lt" | "contains" | "not";
  value: any;
  secondaryOperator?: string;
};
type Sort = { field: string; ascending: boolean };
type Mutation =
  | { kind: "insert"; values: Row[] }
  | { kind: "upsert"; values: Row[]; onConflict?: string; ignoreDuplicates?: boolean }
  | { kind: "update"; values: Row }
  | { kind: "delete" };

type ReadPlan = { sql: string; bindings: unknown[]; paginationPushed: boolean };
type UpdatePlan = { sql: string; bindings: unknown[] };

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Row>(): Promise<{ results?: T[]; success: boolean; error?: string }>;
  first<T = Row>(): Promise<T | null>;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
};

type D1BatchResult = { success?: boolean; error?: string; meta?: { changes?: number } };

type D1DatabaseLike = {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
};

type R2ObjectLike = { arrayBuffer(): Promise<ArrayBuffer>; body: ReadableStream | null };
type R2BucketLike = {
  get(key: string): Promise<R2ObjectLike | null>;
  put(key: string, value: ArrayBuffer | ArrayBufferView | string | ReadableStream, options?: Record<string, unknown>): Promise<unknown>;
  delete(key: string): Promise<void>;
};

export type SomaCloudflareEnv = {
  SOMA_DB: D1DatabaseLike;
  SOMA_ARCHIVES: R2BucketLike;
  [key: string]: unknown;
};

const conflictKeys: Record<string, string[]> = {
  profiles: ["user_id"],
  sleep_preferences: ["user_id"],
  dashboard_layouts: ["user_id"],
  provider_connections: ["user_id", "provider"],
  sync_jobs: ["connection_id", "idempotency_key"],
  webhook_events: ["deduplication_key"],
  ingestion_checkpoints: ["user_id", "provider", "data_type"],
  health_records: ["user_id", "provider", "data_type", "source_record_id"],
  google_health_reconciliation_stage: ["job_id", "reconciliation_token", "source_record_id"],
  daily_health_metrics: ["user_id", "metric_date"],
  daily_scores: ["user_id", "score_date", "kind"],
  insights: ["user_id", "deduplication_key"],
  correlation_results: ["user_id", "variable_x", "variable_y", "lag_days", "date_start", "date_end"],
  briefs: ["user_id", "kind", "brief_date"],
  journal_variables: ["user_id", "name"],
  journal_entries: ["user_id", "variable_id", "entry_date"],
  lab_narratives: ["user_id"],
  lab_narrative_history: ["user_id", "analysis_date"],
  journal_imports: ["id"],
  journal_days: ["user_id", "entry_date"],
  lab_metric_preferences: ["user_id", "metric_id"],
  daily_calendar_metrics: ["user_id", "metric_date"],
  daily_checkins: ["user_id", "checkin_date"],
  health_record_archives: ["user_id", "provider", "data_type", "range_start", "range_end"],
  // Meal rows are created and constrained by calendar slot. Updates and
  // deletes must reuse that same physical key instead of attempting to insert
  // a second row keyed by the generated id.
  meals: ["user_id", "meal_date", "meal_type"],
  meal_photos: ["user_id", "id"],
  meal_analyses: ["user_id", "id"],
  meal_feelings: ["user_id", "meal_id"],
};

export const labMatrixRevisionTables = [
  "profiles",
  "daily_health_metrics",
  "daily_scores",
  "daily_calendar_metrics",
  "daily_checkins",
  "meals",
  "meal_photos",
  "meal_analyses",
  "meal_feelings",
  "journal_variables",
  "journal_entries",
  "journal_days",
  "lab_metric_preferences",
] as const;

const labMatrixRevisionTableSet = new Set<string>(labMatrixRevisionTables);
const LAB_MATRIX_REVISION_TABLE = "lab_matrix_revisions";

export function affectsLabMatrixRevision(table: string) {
  return labMatrixRevisionTableSet.has(table);
}

function labMatrixRevisionStatement(db: D1DatabaseLike, userId: string) {
  const now = new Date().toISOString();
  const row = { user_id: userId, revision: 1, updated_at: now };
  return db.prepare(`
    INSERT INTO soma_rows (table_name, row_key, user_id, json_data, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(table_name, row_key) DO UPDATE SET
      user_id = excluded.user_id,
      json_data = json_set(
        excluded.json_data,
        '$.revision',
        COALESCE(CAST(json_extract(soma_rows.json_data, '$.revision') AS INTEGER), 0) + 1
      ),
      updated_at = excluded.updated_at
  `).bind(LAB_MATRIX_REVISION_TABLE, userId, userId, JSON.stringify(row), now, now);
}

export function cloudflareEnv() {
  return getCloudflareContext().env as unknown as SomaCloudflareEnv;
}

export function cloudflareDb() {
  const database = cloudflareEnv().SOMA_DB;
  if (!database) throw new Error("The SOMA_DB binding is not configured.");
  return database;
}

export function cloudflareArchives() {
  const bucket = cloudflareEnv().SOMA_ARCHIVES;
  if (!bucket) throw new Error("The SOMA_ARCHIVES binding is not configured.");
  return bucket;
}

export async function saveCloudflareJournalDay({ userId, entryDate, entries, validate, replaceOmissions }: { userId: string; entryDate: string; entries: Array<{ variable_id: string; value: unknown }>; validate: boolean; replaceOmissions: boolean }) {
  if (hasSupabaseRuntime()) {
    const admin = createCloudflareAdminClient();
    const currentDayResult = await admin.from("journal_days").select("*").eq("user_id", userId).eq("entry_date", entryDate).maybeSingle();
    if (currentDayResult.error) throw new Error(currentDayResult.error.message);
    const currentDay = currentDayResult.data as Row | null;
    const wasValidated = currentDay?.status === "validated";
    const now = new Date().toISOString();
    for (const entry of entries) {
      const row = { user_id: userId, variable_id: entry.variable_id, entry_date: entryDate };
      if (entry.value === null) {
        const result = await admin.from("journal_entries").delete().eq("user_id", userId).eq("variable_id", entry.variable_id).eq("entry_date", entryDate);
        if (result.error) throw new Error(result.error.message);
        continue;
      }
      const result = await admin.from("journal_entries").upsert(withDefaults({ ...row, value: entry.value }), { onConflict: "user_id,variable_id,entry_date" });
      if (result.error) throw new Error(result.error.message);
    }
    const dayRow = withDefaults({
      ...(currentDay ?? {}),
      user_id: userId,
      entry_date: entryDate,
      status: validate || wasValidated ? "validated" : "draft",
      validated_at: validate || wasValidated ? currentDay?.validated_at ?? now : null,
      omitted_variables: mergeJournalOmissions(currentDay?.omitted_variables, entries, replaceOmissions),
      updated_at: now,
    });
    const dayResult = await admin.from("journal_days").upsert(dayRow, { onConflict: "user_id,entry_date" });
    if (dayResult.error) throw new Error(dayResult.error.message);
    const revisionResult = await admin.from(LAB_MATRIX_REVISION_TABLE).upsert({ user_id: userId, revision: 1, updated_at: now }, { onConflict: "user_id" });
    if (revisionResult.error) throw new Error(revisionResult.error.message);

    const persistedEntriesResult = await admin.from("journal_entries").select("*").eq("user_id", userId).eq("entry_date", entryDate);
    const persistedDayResult = await admin.from("journal_days").select("*").eq("user_id", userId).eq("entry_date", entryDate).maybeSingle();
    if (persistedEntriesResult.error) throw new Error(persistedEntriesResult.error.message);
    if (persistedDayResult.error) throw new Error(persistedDayResult.error.message);
    assertJournalDayPersisted({ entryDate, entries, persistedEntries: persistedEntriesResult.data ?? [], persistedDay: persistedDayResult.data, expectedStatus: validate || wasValidated ? "validated" : "draft" });
    return;
  }
  const db = cloudflareDb();
  const dayResult = await db.prepare("SELECT json_data FROM soma_rows WHERE table_name = ? AND user_id = ? AND json_extract(json_data, '$.entry_date') = ? LIMIT 1")
    .bind("journal_days", userId, entryDate).first<{ json_data: string }>();
  const currentDay = dayResult ? JSON.parse(dayResult.json_data) as Row : null;
  const wasValidated = currentDay?.status === "validated";
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];

  for (const entry of entries) {
    const row = { user_id: userId, variable_id: entry.variable_id, entry_date: entryDate };
    const rowKey = stableIdentity("journal_entries", row, "user_id,variable_id,entry_date");
    if (entry.value === null) {
      statements.push(db.prepare("DELETE FROM soma_rows WHERE table_name = ? AND row_key = ?").bind("journal_entries", rowKey));
      continue;
    }
    const entryRow = withDefaults({ ...row, value: entry.value });
    statements.push(db.prepare("INSERT INTO soma_rows (table_name, row_key, user_id, json_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(table_name, row_key) DO UPDATE SET user_id = excluded.user_id, json_data = excluded.json_data, updated_at = excluded.updated_at")
      .bind("journal_entries", rowKey, userId, JSON.stringify(entryRow), entryRow.created_at, entryRow.updated_at));
  }

  const omittedVariables = mergeJournalOmissions(currentDay?.omitted_variables, entries, replaceOmissions);
  const dayRow = withDefaults({
    ...(currentDay ?? {}),
    user_id: userId,
    entry_date: entryDate,
    status: validate || wasValidated ? "validated" : "draft",
    validated_at: validate || wasValidated ? currentDay?.validated_at ?? now : null,
    omitted_variables: omittedVariables,
    updated_at: now,
  });
  const dayKey = stableIdentity("journal_days", dayRow, "user_id,entry_date");
  statements.push(db.prepare("INSERT INTO soma_rows (table_name, row_key, user_id, json_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(table_name, row_key) DO UPDATE SET user_id = excluded.user_id, json_data = excluded.json_data, updated_at = excluded.updated_at")
    .bind("journal_days", dayKey, userId, JSON.stringify(dayRow), dayRow.created_at, dayRow.updated_at));
  statements.push(labMatrixRevisionStatement(db, userId));

  const results = await db.batch<D1BatchResult>(statements);
  const failed = results.find((result) => result?.success === false);
  if (failed) throw new Error(failed.error ?? "Cloudflare D1 journal write failed.");

  const singleEntryKey = entries.length === 1
    ? stableIdentity("journal_entries", { user_id: userId, variable_id: entries[0].variable_id, entry_date: entryDate }, "user_id,variable_id,entry_date")
    : null;
  const persistedEntriesResult = singleEntryKey
    ? await db.prepare("SELECT json_data FROM soma_rows WHERE table_name = ? AND row_key = ?").bind("journal_entries", singleEntryKey).all<{ json_data: string }>()
    : await db.prepare("SELECT json_data FROM soma_rows WHERE table_name = ? AND user_id = ? AND json_extract(json_data, '$.entry_date') = ?").bind("journal_entries", userId, entryDate).all<{ json_data: string }>();
  const persistedDayResult = await db.prepare("SELECT json_data FROM soma_rows WHERE table_name = ? AND row_key = ? LIMIT 1")
    .bind("journal_days", dayKey).first<{ json_data: string }>();
  if (!persistedEntriesResult.success) throw new Error(persistedEntriesResult.error ?? "Cloudflare D1 journal verification failed.");
  const persistedEntries = (persistedEntriesResult.results ?? []).map((result) => JSON.parse(result.json_data) as Row);
  const persistedDay = persistedDayResult ? JSON.parse(persistedDayResult.json_data) as Row : null;
  assertJournalDayPersisted({ entryDate, entries, persistedEntries, persistedDay, expectedStatus: validate || wasValidated ? "validated" : "draft" });
}

export function mergeJournalOmissions(current: unknown, entries: Array<{ variable_id: string; value: unknown }>, replace: boolean) {
  const omitted = new Set(replace ? [] : Array.isArray(current) ? current.filter((value): value is string => typeof value === "string") : []);
  for (const entry of entries) {
    if (entry.value === null) omitted.add(entry.variable_id);
    else omitted.delete(entry.variable_id);
  }
  return [...omitted];
}

export function assertJournalDayPersisted({ entryDate, entries, persistedEntries, persistedDay, expectedStatus }: {
  entryDate: string;
  entries: Array<{ variable_id: string; value: unknown }>;
  persistedEntries: Row[];
  persistedDay: Row | null;
  expectedStatus: "draft" | "validated";
}) {
  const persistedByVariable = new Map(persistedEntries.map((entry) => [entry.variable_id, entry]));
  for (const entry of entries) {
    const persisted = persistedByVariable.get(entry.variable_id);
    if (entry.value === null) {
      if (persisted) throw new Error("Cloudflare D1 kept an omitted journal value.");
      continue;
    }
    if (!persisted || persisted.entry_date !== entryDate || JSON.stringify(persisted.value) !== JSON.stringify(entry.value)) {
      throw new Error("Cloudflare D1 did not persist the journal value for the selected date.");
    }
  }
  if (!persistedDay || persistedDay.entry_date !== entryDate || persistedDay.status !== expectedStatus) {
    throw new Error("Cloudflare D1 did not persist the selected journal day.");
  }
}

export async function claimCloudflareLock(lockKey: string, userId: string, ttlMs = 60_000) {
  if (hasSupabaseRuntime()) {
    const admin = createCloudflareAdminClient();
    const existingResult = await admin.from("operation_locks").select("*").eq("id", lockKey).maybeSingle();
    if (existingResult.error) throw new Error(existingResult.error.message);
    const now = Date.now();
    if (existingResult.data && Number(existingResult.data.expires_at_ms) >= now) return false;
    if (existingResult.data) await admin.from("operation_locks").delete().eq("id", lockKey);
    const result = await admin.from("operation_locks").insert({ id: lockKey, user_id: userId, expires_at_ms: now + ttlMs });
    return !result.error;
  }
  const db = cloudflareDb();
  const now = Date.now();
  await db.prepare("DELETE FROM soma_rows WHERE table_name = ? AND row_key = ? AND CAST(json_extract(json_data, '$.expires_at_ms') AS INTEGER) < ?")
    .bind("operation_locks", lockKey, now).run();
  const row = { user_id: userId, expires_at_ms: now + ttlMs };
  const result = await db.prepare("INSERT OR IGNORE INTO soma_rows (table_name, row_key, user_id, json_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind("operation_locks", lockKey, userId, JSON.stringify(row), new Date(now).toISOString(), new Date(now).toISOString()).run();
  if (!result.success) throw new Error(result.error ?? "The operation lock could not be acquired.");
  return Number(result.meta?.changes ?? 0) > 0;
}

export async function releaseCloudflareLock(lockKey: string, userId: string) {
  if (hasSupabaseRuntime()) {
    const result = await createCloudflareAdminClient().from("operation_locks").delete().eq("id", lockKey).eq("user_id", userId);
    if (result.error) throw new Error(result.error.message);
    return;
  }
  const result = await cloudflareDb().prepare("DELETE FROM soma_rows WHERE table_name = ? AND row_key = ? AND user_id = ?")
    .bind("operation_locks", lockKey, userId).run();
  if (!result.success) throw new Error(result.error ?? "The operation lock could not be released.");
}

/**
 * Lease variant for long-running meal operations. The owner token prevents a
 * worker whose lease expired from deleting a newer worker's lock.
 */
export async function claimCloudflareLockWithToken(lockKey: string, userId: string, ttlMs = 60_000) {
  if (hasSupabaseRuntime()) {
    const admin = createCloudflareAdminClient();
    const existingResult = await admin.from("operation_locks").select("*").eq("id", lockKey).maybeSingle();
    if (existingResult.error) throw new Error(existingResult.error.message);
    const now = Date.now();
    if (existingResult.data && Number(existingResult.data.expires_at_ms) >= now) return null;
    if (existingResult.data) await admin.from("operation_locks").delete().eq("id", lockKey);
    const token = crypto.randomUUID();
    const result = await admin.from("operation_locks").insert({ id: lockKey, user_id: userId, token, expires_at_ms: now + ttlMs });
    return result.error ? null : token;
  }
  const db = cloudflareDb();
  const now = Date.now();
  await db.prepare("DELETE FROM soma_rows WHERE table_name = ? AND row_key = ? AND CAST(json_extract(json_data, '$.expires_at_ms') AS INTEGER) < ?")
    .bind("operation_locks", lockKey, now).run();
  const token = crypto.randomUUID();
  const row = { user_id: userId, token, expires_at_ms: now + ttlMs };
  const result = await db.prepare("INSERT OR IGNORE INTO soma_rows (table_name, row_key, user_id, json_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind("operation_locks", lockKey, userId, JSON.stringify(row), new Date(now).toISOString(), new Date(now).toISOString()).run();
  if (!result.success) throw new Error(result.error ?? "The operation lock could not be acquired.");
  return Number(result.meta?.changes ?? 0) > 0 ? token : null;
}

export async function refreshCloudflareLockWithToken(lockKey: string, userId: string, token: string, ttlMs = 60_000) {
  if (hasSupabaseRuntime()) {
    const result = await createCloudflareAdminClient().from("operation_locks").update({ expires_at_ms: Date.now() + ttlMs }).eq("id", lockKey).eq("user_id", userId).eq("token", token).select("id").maybeSingle();
    if (result.error) throw new Error(result.error.message);
    return Boolean(result.data);
  }
  const now = Date.now();
  const result = await cloudflareDb().prepare(`
    UPDATE soma_rows
    SET json_data = json_set(json_data, '$.expires_at_ms', ?), updated_at = ?
    WHERE table_name = ? AND row_key = ? AND user_id = ? AND json_extract(json_data, '$.token') = ?
  `).bind(now + ttlMs, new Date(now).toISOString(), "operation_locks", lockKey, userId, token).run();
  if (!result.success) throw new Error(result.error ?? "The operation lock could not be refreshed.");
  return Number(result.meta?.changes ?? 0) > 0;
}

export async function releaseCloudflareLockWithToken(lockKey: string, userId: string, token: string) {
  if (hasSupabaseRuntime()) {
    const result = await createCloudflareAdminClient().from("operation_locks").delete().eq("id", lockKey).eq("user_id", userId).eq("token", token);
    if (result.error) throw new Error(result.error.message);
    return;
  }
  const result = await cloudflareDb().prepare("DELETE FROM soma_rows WHERE table_name = ? AND row_key = ? AND user_id = ? AND json_extract(json_data, '$.token') = ?")
    .bind("operation_locks", lockKey, userId, token).run();
  if (!result.success) throw new Error(result.error ?? "The operation lock could not be released.");
}

export async function latestHealthRecordsByType(userId: string, dataTypes: readonly string[]) {
  if (!dataTypes.length) return [] as Array<{ data_type: string; civil_date: string | null; measured_at: string | null }>;
  if (hasSupabaseRuntime()) {
    const result = await createCloudflareAdminClient().from("health_records").select("data_type,civil_date,measured_at").eq("user_id", userId).in("data_type", [...dataTypes]);
    if (result.error) throw new Error(result.error.message);
    const latest = new Map<string, { data_type: string; civil_date: string | null; measured_at: string | null }>();
    for (const row of result.data ?? []) {
      const current = latest.get(row.data_type);
      if (!current || String(row.civil_date ?? "") > String(current.civil_date ?? "") || String(row.measured_at ?? "") > String(current.measured_at ?? "")) latest.set(row.data_type, row);
    }
    return [...latest.values()];
  }
  const placeholders = dataTypes.map(() => "?").join(", ");
  const statement = cloudflareDb().prepare(`
    WITH ranked AS (
      SELECT
        json_extract(json_data, '$.data_type') AS data_type,
        json_extract(json_data, '$.civil_date') AS civil_date,
        json_extract(json_data, '$.measured_at') AS measured_at,
        ROW_NUMBER() OVER (
          PARTITION BY json_extract(json_data, '$.data_type')
          ORDER BY
            json_extract(json_data, '$.civil_date') IS NULL,
            json_extract(json_data, '$.civil_date') DESC,
            json_extract(json_data, '$.measured_at') IS NULL,
            json_extract(json_data, '$.measured_at') DESC
        ) AS position
      FROM soma_rows
      WHERE table_name = 'health_records'
        AND user_id = ?
        AND json_extract(json_data, '$.data_type') IN (${placeholders})
    )
    SELECT data_type, civil_date, measured_at
    FROM ranked
    WHERE position = 1
  `).bind(userId, ...dataTypes);
  const result = await statement.all<{ data_type: string; civil_date: string | null; measured_at: string | null }>();
  if (!result.success) throw new Error(result.error ?? "Latest health records could not be loaded from D1.");
  return result.results ?? [];
}

export async function healthSyncDiagnostics(userId: string, dataTypes: readonly string[]) {
  if (hasSupabaseRuntime()) {
    const [healthResult, analyticsResult] = await Promise.all([
      createCloudflareAdminClient().from("health_records").select("data_type,civil_date").eq("user_id", userId).in("data_type", [...dataTypes]),
      createCloudflareAdminClient().from("daily_health_metrics").select("id").eq("user_id", userId),
    ]);
    if (healthResult.error) throw new Error(healthResult.error.message);
    if (analyticsResult.error) throw new Error(analyticsResult.error.message);
    const importedRecords = Object.fromEntries(dataTypes.map((dataType) => [dataType, (healthResult.data ?? []).filter((row) => row.data_type === dataType).length]));
    return {
      importedRecords,
      analytics: {
        datedRecords: (healthResult.data ?? []).filter((row) => row.civil_date !== null).length,
        metricDays: analyticsResult.data?.length ?? 0,
        scoreRows: 0,
      },
    };
  }
  const healthResult = await cloudflareDb().prepare(`
    SELECT
      json_extract(json_data, '$.data_type') AS data_type,
      COUNT(*) AS record_count,
      SUM(CASE WHEN json_extract(json_data, '$.civil_date') IS NOT NULL THEN 1 ELSE 0 END) AS dated_count
    FROM soma_rows
    WHERE table_name = 'health_records'
      AND user_id = ?
    GROUP BY json_extract(json_data, '$.data_type')
  `).bind(userId).all<{ data_type: string; record_count: number; dated_count: number }>();
  if (!healthResult.success) throw new Error(healthResult.error ?? "Health record diagnostics could not be loaded from D1.");

  const analyticsResult = await cloudflareDb().prepare(`
    SELECT table_name, COUNT(*) AS row_count
    FROM soma_rows
    WHERE user_id = ?
      AND table_name IN ('daily_health_metrics', 'daily_scores')
    GROUP BY table_name
  `).bind(userId).all<{ table_name: string; row_count: number }>();
  if (!analyticsResult.success) throw new Error(analyticsResult.error ?? "Health analytics diagnostics could not be loaded from D1.");

  const healthRows = healthResult.results ?? [];
  const analyticsRows = new Map((analyticsResult.results ?? []).map((row) => [row.table_name, Number(row.row_count)]));
  const recordCounts = new Map(healthRows.map((row) => [row.data_type, Number(row.record_count)]));
  return {
    importedRecords: Object.fromEntries(dataTypes.map((dataType) => [dataType, recordCounts.get(dataType) ?? 0])),
    analytics: {
      datedRecords: healthRows.reduce((total, row) => total + Number(row.dated_count), 0),
      metricDays: analyticsRows.get("daily_health_metrics") ?? 0,
      scoreRows: analyticsRows.get("daily_scores") ?? 0,
    },
  };
}

export async function healthRecordsForAnalysis(userId: string, dataTypes: readonly string[], analysisStart: string) {
  if (!dataTypes.length) return [];
  if (hasSupabaseRuntime()) {
    const result = await createCloudflareAdminClient().from("health_records").select("*").eq("user_id", userId).in("data_type", [...dataTypes]).or(`civil_date.gte.${analysisStart},end_time.gte.${analysisStart}T00:00:00.000Z,start_time.gte.${analysisStart}T00:00:00.000Z,measured_at.gte.${analysisStart}T00:00:00.000Z`).order("id");
    if (result.error) throw new Error(result.error.message);
    return result.data ?? [];
  }
  const placeholders = dataTypes.map(() => "?").join(", ");
  const analysisStartTime = `${analysisStart}T00:00:00.000Z`;
  const result = await cloudflareDb().prepare(`
    SELECT json_data
    FROM soma_rows
    WHERE table_name = 'health_records'
      AND user_id = ?
      AND json_extract(json_data, '$.data_type') IN (${placeholders})
      AND (
        json_extract(json_data, '$.civil_date') >= ?
        OR json_extract(json_data, '$.end_time') >= ?
        OR json_extract(json_data, '$.start_time') >= ?
        OR json_extract(json_data, '$.measured_at') >= ?
      )
    ORDER BY json_extract(json_data, '$.id')
  `).bind(userId, ...dataTypes, analysisStart, analysisStartTime, analysisStartTime, analysisStartTime)
    .all<{ json_data: string }>();
  if (!result.success) throw new Error(result.error ?? "Health analysis records could not be loaded from D1.");
  return (result.results ?? []).map((row) => JSON.parse(row.json_data) as Row);
}

export async function labMatrixInputRevision(userId: string) {
  if (hasSupabaseRuntime()) {
    const result = await createCloudflareAdminClient().from(LAB_MATRIX_REVISION_TABLE).select("revision").eq("user_id", userId).maybeSingle();
    if (result.error) throw new Error(result.error.message);
    const revision = Number(result.data?.revision);
    return Number.isSafeInteger(revision) && revision >= 0 ? String(revision) : "0";
  }
  const row = await cloudflareDb().prepare("SELECT json_data FROM soma_rows WHERE table_name = ? AND row_key = ? LIMIT 1")
    .bind(LAB_MATRIX_REVISION_TABLE, userId)
    .first<{ json_data: string }>();
  if (!row) return "0";
  const revision = Number((JSON.parse(row.json_data) as { revision?: unknown }).revision);
  return Number.isSafeInteger(revision) && revision >= 0 ? String(revision) : "0";
}

export function stableIdentity(table: string, row: Row, explicitConflict?: string) {
  const keys = explicitConflict?.split(",").map((key) => key.trim()).filter(Boolean)
    ?? conflictKeys[table]
    ?? (row.id ? ["id"] : []);
  const identity = keys.length && keys.every((key) => row[key] !== undefined)
    ? keys.map((key) => [key, row[key]])
    : [["id", row.id ?? crypto.randomUUID()]];
  return encodeURIComponent(JSON.stringify(identity));
}

function topLevelColumns(selector: string | undefined) {
  if (!selector || selector.trim() === "*") return null;
  const columns: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of selector) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      columns.push(current.trim());
      current = "";
    } else current += char;
  }
  if (current.trim()) columns.push(current.trim());
  return columns.map((column) => column.includes("(") ? column.slice(0, column.indexOf("(")).trim() : column.split(":").at(-1) as string);
}

function projectRow(row: Row, selector: string | undefined) {
  const columns = topLevelColumns(selector);
  if (!columns) return row;
  // PostgreSQL columns selected through Supabase are returned as null when a
  // row has no value. Preserve that contract for sparse JSON rows in D1 so
  // consumers never mistake a missing measurement for a number (or for zero).
  return Object.fromEntries(columns.map((column) => [column, row[column] === undefined ? null : row[column]]));
}

function valueAt(row: Row, field: string) {
  return field.split(".").reduce<any>((value, key) => value?.[key], row);
}

function matches(row: Row, filter: Filter): boolean {
  const actual = valueAt(row, filter.field);
  switch (filter.operator) {
    case "eq": return actual === filter.value;
    case "neq": return actual !== filter.value;
    case "in": return Array.isArray(filter.value) && filter.value.includes(actual);
    case "is": return filter.value === null ? actual == null : actual === filter.value;
    case "gte": return actual >= filter.value;
    case "gt": return actual > filter.value;
    case "lte": return actual <= filter.value;
    case "lt": return actual < filter.value;
    case "contains": return Array.isArray(actual) && filter.value.every((item: any) => actual.includes(item));
    case "not": return !matches(row, { field: filter.field, operator: filter.secondaryOperator as Filter["operator"], value: filter.value });
  }
}

function parseOrExpression(expression: string) {
  return expression.split(",").map((part) => {
    const [field, operator, ...raw] = part.split(".");
    const joined = raw.join(".");
    const value: string | null = joined === "null" ? null : joined;
    return { field, operator, value };
  });
}

function matchesOr(row: Row, expressions: ReturnType<typeof parseOrExpression>) {
  return expressions.some(({ field, operator, value }) => {
    const actual = valueAt(row, field);
    if (operator === "eq") return actual === value;
    if (operator === "gte") return value !== null && actual >= value;
    if (operator === "gt") return value !== null && actual > value;
    if (operator === "lte") return value !== null && actual <= value;
    if (operator === "lt") return value !== null && actual < value;
    if (operator === "is") return value === null ? actual == null : actual === value;
    return false;
  });
}

function safeJsonPath(field: string) {
  return /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/.test(field) ? `$.${field}` : null;
}

function d1Value(value: any) {
  return typeof value === "boolean" ? Number(value) : value;
}

export function buildCloudflareReadPlan({
  table,
  filters,
  orFilterCount,
  sorts,
  fromIndex,
  toIndex,
  maxRows,
}: {
  table: string;
  filters: Filter[];
  orFilterCount: number;
  sorts: Sort[];
  fromIndex: number;
  toIndex?: number;
  maxRows?: number;
}): ReadPlan {
  const where = ["table_name = ?"];
  const bindings: unknown[] = [table];
  let allFiltersPushed = true;

  for (const filter of filters) {
    const isUserId = filter.field === "user_id";
    const path = safeJsonPath(filter.field);
    const expression = isUserId ? "user_id" : path ? `json_extract(json_data, '${path}')` : null;
    if (!expression || filter.operator === "contains" || filter.operator === "not" || filter.operator === "neq") {
      allFiltersPushed = false;
      continue;
    }
    if (filter.value === null && filter.operator !== "is") {
      allFiltersPushed = false;
      continue;
    }
    if (filter.operator === "is" && filter.value === null) {
      where.push(`${expression} IS NULL`);
      continue;
    }
    if (filter.operator === "in") {
      if (!Array.isArray(filter.value) || filter.value.length === 0) {
        where.push("0 = 1");
        continue;
      }
      where.push(`${expression} IN (${filter.value.map(() => "?").join(", ")})`);
      bindings.push(...filter.value.map(d1Value));
      continue;
    }
    const operator = { eq: "=", neq: "!=", is: "IS", gte: ">=", gt: ">", lte: "<=", lt: "<" }[filter.operator];
    if (!operator) {
      allFiltersPushed = false;
      continue;
    }
    where.push(`${expression} ${operator} ?`);
    bindings.push(d1Value(filter.value));
  }

  let sql = `SELECT json_data FROM soma_rows WHERE ${where.join(" AND ")}`;
  const order = sorts.flatMap((sort) => {
    const path = safeJsonPath(sort.field);
    if (!path) return [];
    const expression = `json_extract(json_data, '${path}')`;
    return [`${expression} IS NULL ${sort.ascending ? "ASC" : "DESC"}`, `${expression} ${sort.ascending ? "ASC" : "DESC"}`];
  });
  const allSortsPushed = order.length === sorts.length * 2;
  if (allSortsPushed && order.length) sql += ` ORDER BY ${order.join(", ")}`;

  const paginationPushed = allFiltersPushed && allSortsPushed && orFilterCount === 0;
  if (paginationPushed) {
    const rangeSize = toIndex === undefined ? undefined : Math.max(0, toIndex - fromIndex + 1);
    const limit = rangeSize === undefined ? maxRows : maxRows === undefined ? rangeSize : Math.min(rangeSize, maxRows);
    if (limit !== undefined) {
      sql += " LIMIT ? OFFSET ?";
      bindings.push(Math.max(0, limit), Math.max(0, fromIndex));
    } else if (fromIndex > 0) {
      sql += " LIMIT -1 OFFSET ?";
      bindings.push(fromIndex);
    }
  }

  return { sql, bindings, paginationPushed };
}

function cleanRow(row: Row) {
  return JSON.parse(JSON.stringify(row)) as Row;
}

function withDefaults(row: Row) {
  const now = new Date().toISOString();
  return cleanRow({
    ...row,
    id: row.id ?? crypto.randomUUID(),
    created_at: row.created_at ?? now,
    updated_at: row.updated_at ?? now,
  });
}

async function writeRows(table: string, rows: Row[], explicitConflict?: string, ignoreDuplicates = false) {
  const db = cloudflareDb();
  const statements = rows.map((row) => {
    const rowKey = stableIdentity(table, row, explicitConflict);
    const sql = ignoreDuplicates
      ? "INSERT OR IGNORE INTO soma_rows (table_name, row_key, user_id, json_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      : "INSERT INTO soma_rows (table_name, row_key, user_id, json_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(table_name, row_key) DO UPDATE SET user_id = excluded.user_id, json_data = excluded.json_data, updated_at = excluded.updated_at";
    return db.prepare(sql).bind(table, rowKey, row.user_id ?? null, JSON.stringify(row), row.created_at ?? null, row.updated_at ?? null);
  });
  for (let index = 0; index < statements.length; index += 35) {
    const rowSlice = rows.slice(index, index + 35);
    const revisionUserIds = affectsLabMatrixRevision(table)
      ? [...new Set(rowSlice.flatMap((row) => typeof row.user_id === "string" ? [row.user_id] : []))]
      : [];
    const results = await db.batch<D1BatchResult>([
      ...statements.slice(index, index + 35),
      ...revisionUserIds.map((userId) => labMatrixRevisionStatement(db, userId)),
    ]);
    const failed = results.find((result) => result?.success === false);
    if (failed) throw new Error(failed.error ?? "Cloudflare D1 write failed.");
  }
}

export function buildCloudflareUpdatePlan(table: string, existing: Row, changed: Row, conditions: Filter[] = []): UpdatePlan {
  const where = ["table_name = ?", "row_key = ?"];
  const conditionBindings: unknown[] = [table, stableIdentity(table, existing)];
  for (const condition of conditions) {
    const expression = condition.field === "user_id"
      ? "user_id"
      : safeJsonPath(condition.field) ? `json_extract(json_data, '$.${condition.field}')` : null;
    if (!expression) continue;
    if (condition.operator === "is" && condition.value === null) {
      where.push(`${expression} IS NULL`);
    } else if (condition.operator === "eq") {
      where.push(`${expression} = ?`);
      conditionBindings.push(d1Value(condition.value));
    }
  }
  return {
    sql: `
      UPDATE soma_rows
      SET row_key = ?, user_id = ?, json_data = ?, updated_at = ?
      WHERE ${where.join(" AND ")}
    `,
    bindings: [
      stableIdentity(table, changed),
      changed.user_id ?? null,
      JSON.stringify(changed),
      changed.updated_at ?? null,
      ...conditionBindings,
    ],
  };
}

async function updateRowsInPlace(table: string, existing: Row[], changed: Row[], conditions: Filter[] = []) {
  const db = cloudflareDb();
  const persisted: Row[] = [];
  for (let index = 0; index < changed.length; index += 30) {
    const existingSlice = existing.slice(index, index + 30);
    const changedSlice = changed.slice(index, index + 30);
    const revisionUserIds = affectsLabMatrixRevision(table)
      ? [...new Set(changedSlice.flatMap((row) => typeof row.user_id === "string" ? [row.user_id] : []))]
      : [];
    const statements = changedSlice.map((row, rowIndex) => {
      const plan = buildCloudflareUpdatePlan(table, existingSlice[rowIndex], row, conditions);
      return db.prepare(plan.sql).bind(...plan.bindings);
    });
    const results = await db.batch<D1BatchResult>([
      ...statements,
      ...revisionUserIds.map((userId) => labMatrixRevisionStatement(db, userId)),
    ]);
    const failed = results.find((result) => result?.success === false);
    if (failed) throw new Error(failed.error ?? "Cloudflare D1 update failed.");
    changedSlice.forEach((row, rowIndex) => {
      if (results[rowIndex]?.meta?.changes !== 0) persisted.push(row);
    });
  }
  return persisted;
}

class CloudflareQueryBuilder implements PromiseLike<ManyResult> {
  private selector: string | undefined;
  private selectOptions: { count?: "exact"; head?: boolean } | undefined;
  private filters: Filter[] = [];
  private orFilters: Array<ReturnType<typeof parseOrExpression>> = [];
  private sorts: Sort[] = [];
  private maxRows: number | undefined;
  private fromIndex = 0;
  private toIndex: number | undefined;
  private cardinality: "many" | "single" | "maybeSingle" = "many";
  private mutation: Mutation | undefined;

  constructor(private table: string) {}

  select(selector = "*", options?: { count?: "exact"; head?: boolean }) { this.selector = selector; this.selectOptions = options; return this; }
  insert(values: Row | Row[]) { this.mutation = { kind: "insert", values: Array.isArray(values) ? values : [values] }; return this; }
  upsert(values: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.mutation = { kind: "upsert", values: Array.isArray(values) ? values : [values], onConflict: options?.onConflict, ignoreDuplicates: options?.ignoreDuplicates };
    return this;
  }
  update(values: Row) { this.mutation = { kind: "update", values }; return this; }
  delete() { this.mutation = { kind: "delete" }; return this; }
  eq(field: string, value: any) { this.filters.push({ field, operator: "eq", value }); return this; }
  neq(field: string, value: any) { this.filters.push({ field, operator: "neq", value }); return this; }
  in(field: string, value: any[]) { this.filters.push({ field, operator: "in", value }); return this; }
  is(field: string, value: any) { this.filters.push({ field, operator: "is", value }); return this; }
  gte(field: string, value: any) { this.filters.push({ field, operator: "gte", value }); return this; }
  gt(field: string, value: any) { this.filters.push({ field, operator: "gt", value }); return this; }
  lte(field: string, value: any) { this.filters.push({ field, operator: "lte", value }); return this; }
  lt(field: string, value: any) { this.filters.push({ field, operator: "lt", value }); return this; }
  contains(field: string, value: any[]) { this.filters.push({ field, operator: "contains", value }); return this; }
  not(field: string, operator: string, value: any) { this.filters.push({ field, operator: "not", secondaryOperator: operator, value }); return this; }
  or(expression: string) { this.orFilters.push(parseOrExpression(expression)); return this; }
  order(field: string, options?: { ascending?: boolean; nullsFirst?: boolean }) { this.sorts.push({ field, ascending: options?.ascending !== false }); return this; }
  limit(value: number) { this.maxRows = value; return this; }
  range(from: number, to: number) { this.fromIndex = from; this.toIndex = to; return this; }
  single() { this.cardinality = "single"; return this as unknown as PromiseLike<SingleResult>; }
  maybeSingle() { this.cardinality = "maybeSingle"; return this as unknown as PromiseLike<SingleResult>; }

  private async readRows() {
    const db = cloudflareDb();
    const plan = buildCloudflareReadPlan({
      table: this.table,
      filters: this.filters,
      orFilterCount: this.orFilters.length,
      sorts: this.sorts,
      fromIndex: this.fromIndex,
      toIndex: this.toIndex,
      maxRows: this.maxRows,
    });
    const query = db.prepare(plan.sql).bind(...plan.bindings);
    const result = await query.all<{ json_data: string }>();
    if (!result.success) throw new Error(result.error ?? "D1 read failed.");
    let rows = (result.results ?? []).map((item) => JSON.parse(item.json_data) as Row);
    rows = rows.filter((row) => this.filters.every((filter) => matches(row, filter)));
    rows = rows.filter((row) => this.orFilters.every((expressions) => matchesOr(row, expressions)));
    for (const sort of [...this.sorts].reverse()) {
      rows.sort((left, right) => {
        const a = valueAt(left, sort.field);
        const b = valueAt(right, sort.field);
        const compared = a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : a < b ? -1 : a > b ? 1 : 0;
        return sort.ascending ? compared : -compared;
      });
    }
    if (!plan.paginationPushed) {
      if (this.toIndex !== undefined) rows = rows.slice(this.fromIndex, this.toIndex + 1);
      else if (this.fromIndex) rows = rows.slice(this.fromIndex);
      if (this.maxRows !== undefined) rows = rows.slice(0, this.maxRows);
    }
    if (this.table === "workout_programs" && this.selector?.includes("workout_program_exercises(")) {
      const [exerciseRows, libraryRows] = await Promise.all([
        db.prepare("SELECT json_data FROM soma_rows WHERE table_name = ?").bind("workout_program_exercises").all<{ json_data: string }>(),
        db.prepare("SELECT json_data FROM soma_rows WHERE table_name = ?").bind("exercise_library").all<{ json_data: string }>(),
      ]);
      const exercises = (exerciseRows.results ?? []).map((item) => JSON.parse(item.json_data) as Row);
      const library = new Map((libraryRows.results ?? []).map((item) => {
        const parsed = JSON.parse(item.json_data) as Row;
        return [parsed.id, parsed];
      }));
      rows = rows.map((row) => ({
        ...row,
        workout_program_exercises: exercises
          .filter((exercise) => exercise.program_id === row.id)
          .sort((left, right) => Number(left.position) - Number(right.position))
          .map((exercise) => ({ ...exercise, exercise_library: library.get(exercise.exercise_id) ?? null })),
      }));
    }
    return rows;
  }

  private shape(rows: Row[], totalCount?: number): QueryResult<any> {
    const projected = rows.map((row) => projectRow(row, this.selector));
    const count = this.selectOptions?.count ? (totalCount ?? rows.length) : undefined;
    if (this.selectOptions?.head) return { data: null, error: null, count };
    if (this.cardinality === "single") {
      if (projected.length !== 1) return { data: null, error: { message: "Expected exactly one row.", code: "PGRST116" }, count };
      return { data: projected[0], error: null, count };
    }
    if (this.cardinality === "maybeSingle") {
      if (projected.length > 1) return { data: null, error: { message: "Expected at most one row.", code: "PGRST116" }, count };
      return { data: projected[0] ?? null, error: null, count };
    }
    return { data: projected, error: null, count };
  }

  private async executeMutation() {
    if (!this.mutation) return this.shape(await this.readRows());
    if (this.mutation.kind === "insert" || this.mutation.kind === "upsert") {
      const mutation = this.mutation;
      const rows = mutation.values.map(withDefaults);
      await writeRows(this.table, rows, mutation.kind === "upsert" ? mutation.onConflict : undefined, mutation.kind === "upsert" && mutation.ignoreDuplicates);
      return this.shape(rows);
    }
    const existing = await this.readRows();
    if (this.mutation.kind === "delete") {
      const db = cloudflareDb();
      const statements = existing.map((row) => db.prepare("DELETE FROM soma_rows WHERE table_name = ? AND row_key = ?").bind(this.table, stableIdentity(this.table, row)));
      for (let index = 0; index < statements.length; index += 35) {
        const rowSlice = existing.slice(index, index + 35);
        const revisionUserIds = affectsLabMatrixRevision(this.table)
          ? [...new Set(rowSlice.flatMap((row) => typeof row.user_id === "string" ? [row.user_id] : []))]
          : [];
        await db.batch([
          ...statements.slice(index, index + 35),
          ...revisionUserIds.map((userId) => labMatrixRevisionStatement(db, userId)),
        ]);
      }
      return this.shape(existing);
    }
    const values = this.mutation.values;
    const changed = existing.map((row) => cleanRow({ ...row, ...values, updated_at: new Date().toISOString() }));
    const persisted = await updateRowsInPlace(this.table, existing, changed, this.filters);
    return this.shape(persisted);
  }

  private async execute(): Promise<QueryResult<any>> {
    try {
      return await this.executeMutation();
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : "Cloudflare D1 operation failed." } };
    }
  }

  then<TResult1 = ManyResult, TResult2 = never>(
    onfulfilled?: ((value: ManyResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled as any, onrejected) as PromiseLike<TResult1 | TResult2>;
  }
}

function createD1AdminClient() {
  return {
    from(table: string) { return new CloudflareQueryBuilder(table); },
    async rpc(name: string, parameters: Row) {
      const { executeCloudflareRpc } = await import("@/lib/cloudflare/rpc");
      return executeCloudflareRpc(name, parameters);
    },
    auth: {
      admin: {
        async deleteUser(userId: string) {
          try {
            const db = cloudflareDb();
            await db.batch([
              db.prepare("DELETE FROM soma_sessions WHERE user_id = ?").bind(userId),
              db.prepare("DELETE FROM soma_users WHERE id = ?").bind(userId),
              db.prepare("DELETE FROM soma_rows WHERE user_id = ?").bind(userId),
            ]);
            return { data: null, error: null };
          } catch (error) {
            return { data: null, error: { message: error instanceof Error ? error.message : "Account deletion failed." } };
          }
        },
      },
    },
  };
}

type SupabaseStoredRow = {
  table_name: string;
  row_key: string;
  user_id: string | null;
  json_data: Row;
  created_at: string | null;
  updated_at: string | null;
};

type SupabaseFilter = Filter & { field: string };

const SUPABASE_STORAGE_PAGE_SIZE = 1_000;

export function hasSupabaseRuntime() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  return { url, key };
}

async function supabaseRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, key } = supabaseConfig();
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  headers.set("Accept", "application/json");
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const controller = new AbortController();
  const upstreamSignal = init.signal;
  const relayAbort = () => controller.abort();
  if (upstreamSignal) {
    if (upstreamSignal.aborted) controller.abort();
    else upstreamSignal.addEventListener("abort", relayAbort, { once: true });
  }
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers, signal: controller.signal });
    const body = await response.text();
    let parsed: unknown = null;
    if (body) {
      try { parsed = JSON.parse(body); } catch { parsed = body; }
    }
    if (!response.ok) {
      const message = typeof parsed === "object" && parsed && "message" in parsed
        ? String((parsed as { message: unknown }).message)
        : `Supabase request failed (${response.status}).`;
      throw new Error(message);
    }
    return parsed as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Supabase request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    upstreamSignal?.removeEventListener("abort", relayAbort);
  }
}

function supabasePath(table: string, filters: Array<[string, string]>) {
  const params = new URLSearchParams();
  for (const [key, value] of filters) params.append(key, value);
  const query = params.toString();
  return `${encodeURIComponent(table)}${query ? `?${query}` : ""}`;
}

function supabaseFilterValue(filter: SupabaseFilter) {
  if (filter.operator === "is" && filter.value === null) return "is.null";
  if (filter.operator === "in") return `in.(${(filter.value as unknown[]).map((value) => String(value)).join(",")})`;
  if (filter.operator === "not") return `not.${filter.secondaryOperator}.${String(filter.value)}`;
  return `${filter.operator}.${String(filter.value)}`;
}

function supabaseMutationFilter(filter: SupabaseFilter): [string, string] | null {
  const field = filter.field === "user_id" ? "user_id" : supabaseJsonField(filter.field);
  return field ? [field, supabaseFilterValue(filter)] : null;
}

function storageRow(table: string, row: Row, explicitConflict?: string): SupabaseStoredRow {
  const value = withDefaults(row);
  return {
    table_name: table,
    row_key: stableIdentity(table, value, explicitConflict),
    user_id: value.user_id ?? null,
    json_data: value,
    created_at: value.created_at ?? null,
    updated_at: value.updated_at ?? null,
  };
}

function logicalRow(item: SupabaseStoredRow) {
  const row = cleanRow(item.json_data ?? {});
  if (row.user_id === undefined && item.user_id !== null) row.user_id = item.user_id;
  return row;
}

function supabaseJsonField(field: string) {
  return /^[A-Za-z0-9_]+$/.test(field) ? `json_data->>${field}` : null;
}

function canPushSupabaseFilter(filter: SupabaseFilter) {
  if (filter.value === null && filter.operator !== "is") return false;
  if (filter.field === "user_id") return filter.operator !== "contains" && filter.operator !== "not" && filter.operator !== "neq";
  if (!supabaseJsonField(filter.field)) return false;
  if (["contains", "not", "neq"].includes(filter.operator)) return false;
  if (filter.operator === "in") return Array.isArray(filter.value) && filter.value.length > 0;
  return filter.operator === "is" ? filter.value === null : true;
}

function canPushSupabaseSort(sort: Sort) {
  return Boolean(supabaseJsonField(sort.field));
}

async function readSupabaseStorageRows(
  table: string,
  filters: SupabaseFilter[],
  sorts: Sort[],
  orFilterCount: number,
  fromIndex: number,
  toIndex: number | undefined,
  maxRows: number | undefined,
  exactCount: boolean,
) {
  const serverFilters: Array<[string, string]> = [
    ["select", "table_name,row_key,user_id,json_data,created_at,updated_at"],
    ["table_name", `eq.${table}`],
  ];
  let allFiltersPushed = true;
  for (const filter of filters) {
    if (!canPushSupabaseFilter(filter)) {
      allFiltersPushed = false;
      continue;
    }
    const field = filter.field === "user_id" ? "user_id" : supabaseJsonField(filter.field);
    if (field) serverFilters.push([field, supabaseFilterValue(filter)]);
  }
  const allSortsPushed = sorts.every(canPushSupabaseSort);
  if (allSortsPushed && sorts.length) {
    serverFilters.push(["order", sorts.map((sort) => `${supabaseJsonField(sort.field)}.${sort.ascending ? "asc" : "desc"}`).join(",")]);
  } else {
    serverFilters.push(["order", "row_key.asc"]);
  }

  const paginationPushed = allFiltersPushed && allSortsPushed && orFilterCount === 0 && !exactCount;
  const rangeSize = toIndex === undefined ? undefined : Math.max(0, toIndex - fromIndex + 1);
  const requestedLimit = rangeSize === undefined ? maxRows : maxRows === undefined ? rangeSize : Math.min(rangeSize, maxRows);
  const hasBoundedPage = paginationPushed && (requestedLimit !== undefined || fromIndex > 0);

  if (hasBoundedPage && requestedLimit !== undefined) serverFilters.push(["limit", String(Math.max(0, requestedLimit))]);
  if (hasBoundedPage && fromIndex > 0) serverFilters.push(["offset", String(Math.max(0, fromIndex))]);

  const storedRows: SupabaseStoredRow[] = [];
  const pageFilters: Array<[string, string]> = hasBoundedPage
    ? []
    : [["limit", String(SUPABASE_STORAGE_PAGE_SIZE)], ["offset", "0"]];
  for (let offset = 0; ; offset += SUPABASE_STORAGE_PAGE_SIZE) {
    const page = await supabaseRequest<SupabaseStoredRow[]>(supabasePath("soma_rows", [
      ...serverFilters,
      ...pageFilters.map(([key, value]) => [key, key === "offset" ? String(offset) : value] as [string, string]),
    ]));
    storedRows.push(...page);
    if (hasBoundedPage || page.length < SUPABASE_STORAGE_PAGE_SIZE) break;
  }
  return storedRows.map(logicalRow);
}

class SupabaseQueryBuilder implements PromiseLike<ManyResult> {
  private selector: string | undefined;
  private selectOptions: { count?: "exact"; head?: boolean } | undefined;
  private filters: SupabaseFilter[] = [];
  private orFilters: Array<ReturnType<typeof parseOrExpression>> = [];
  private sorts: Sort[] = [];
  private maxRows: number | undefined;
  private fromIndex = 0;
  private toIndex: number | undefined;
  private cardinality: "many" | "single" | "maybeSingle" = "many";
  private mutation: Mutation | undefined;

  constructor(private table: string) {}

  select(selector = "*", options?: { count?: "exact"; head?: boolean }) { this.selector = selector; this.selectOptions = options; return this; }
  insert(values: Row | Row[]) { this.mutation = { kind: "insert", values: Array.isArray(values) ? values : [values] }; return this; }
  upsert(values: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.mutation = { kind: "upsert", values: Array.isArray(values) ? values : [values], onConflict: options?.onConflict, ignoreDuplicates: options?.ignoreDuplicates };
    return this;
  }
  update(values: Row) { this.mutation = { kind: "update", values }; return this; }
  delete() { this.mutation = { kind: "delete" }; return this; }
  eq(field: string, value: any) { this.filters.push({ field, operator: "eq", value }); return this; }
  neq(field: string, value: any) { this.filters.push({ field, operator: "neq", value }); return this; }
  in(field: string, value: any[]) { this.filters.push({ field, operator: "in", value }); return this; }
  is(field: string, value: any) { this.filters.push({ field, operator: "is", value }); return this; }
  gte(field: string, value: any) { this.filters.push({ field, operator: "gte", value }); return this; }
  gt(field: string, value: any) { this.filters.push({ field, operator: "gt", value }); return this; }
  lte(field: string, value: any) { this.filters.push({ field, operator: "lte", value }); return this; }
  lt(field: string, value: any) { this.filters.push({ field, operator: "lt", value }); return this; }
  contains(field: string, value: any[]) { this.filters.push({ field, operator: "contains", value }); return this; }
  not(field: string, operator: string, value: any) { this.filters.push({ field, operator: "not", secondaryOperator: operator, value }); return this; }
  or(expression: string) { this.orFilters.push(parseOrExpression(expression)); return this; }
  order(field: string, options?: { ascending?: boolean; nullsFirst?: boolean }) { this.sorts.push({ field, ascending: options?.ascending !== false }); return this; }
  limit(value: number) { this.maxRows = value; return this; }
  range(from: number, to: number) { this.fromIndex = from; this.toIndex = to; return this; }
  single() { this.cardinality = "single"; return this as unknown as PromiseLike<SingleResult>; }
  maybeSingle() { this.cardinality = "maybeSingle"; return this as unknown as PromiseLike<SingleResult>; }

  private isPhysicalTable() {
    return this.table === "soma_users" || this.table === "soma_sessions";
  }

  private async readRows() {
    if (this.isPhysicalTable()) {
      const filters: Array<[string, string]> = [["select", this.selector?.trim() || "*"]];
      for (const filter of this.filters) filters.push([filter.field, supabaseFilterValue(filter)]);
      const rows = await supabaseRequest<Row[]>(supabasePath(this.table, filters));
      return rows;
    }

    let rows = await readSupabaseStorageRows(this.table, this.filters, this.sorts, this.orFilters.length, this.fromIndex, this.toIndex, this.maxRows, this.selectOptions?.count === "exact");
    rows = rows.filter((row) => this.filters.every((filter) => matches(row, filter)));
    rows = rows.filter((row) => this.orFilters.every((expressions) => matchesOr(row, expressions)));
    for (const sort of [...this.sorts].reverse()) {
      rows.sort((left, right) => {
        const a = valueAt(left, sort.field);
        const b = valueAt(right, sort.field);
        const compared = a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : a < b ? -1 : a > b ? 1 : 0;
        return sort.ascending ? compared : -compared;
      });
    }
    return rows;
  }

  private shape(rows: Row[], totalCount?: number): QueryResult<any> {
    const projected = rows.map((row) => projectRow(row, this.selector));
    const count = this.selectOptions?.count ? (totalCount ?? rows.length) : undefined;
    if (this.selectOptions?.head) return { data: null, error: null, count };
    if (this.cardinality === "single") {
      if (projected.length !== 1) return { data: null, error: { message: "Expected exactly one row.", code: "PGRST116" }, count };
      return { data: projected[0], error: null, count };
    }
    if (this.cardinality === "maybeSingle") {
      if (projected.length > 1) return { data: null, error: { message: "Expected at most one row.", code: "PGRST116" }, count };
      return { data: projected[0] ?? null, error: null, count };
    }
    return { data: projected, error: null, count };
  }

  private async insertPhysical(rows: Row[], upsert: boolean, onConflict?: string, ignoreDuplicates = false) {
    const headers = new Headers({ Prefer: upsert ? `resolution=${ignoreDuplicates ? "ignore-duplicates" : "merge-duplicates"},return=representation` : "return=representation" });
    const query = upsert && onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : "";
    return supabaseRequest<Row[]>(`${encodeURIComponent(this.table)}${query}`, { method: "POST", headers, body: JSON.stringify(rows) });
  }

  private async insertLogical(rows: Row[], upsert: boolean, onConflict?: string, ignoreDuplicates = false) {
    const stored = rows.map((row) => storageRow(this.table, row, onConflict));
    const headers = new Headers({ Prefer: upsert ? `resolution=${ignoreDuplicates ? "ignore-duplicates" : "merge-duplicates"},return=representation` : "return=representation" });
    const query = upsert ? `?on_conflict=table_name%2Crow_key` : "";
    await supabaseRequest<unknown[]>(`soma_rows${query}`, { method: "POST", headers, body: JSON.stringify(stored) });
    if (affectsLabMatrixRevision(this.table)) {
      const userIds = [...new Set(rows.flatMap((row) => typeof row.user_id === "string" ? [row.user_id] : []))];
      if (userIds.length) await new SupabaseQueryBuilder(LAB_MATRIX_REVISION_TABLE).upsert(userIds.map((userId) => ({ user_id: userId, revision: 1, updated_at: new Date().toISOString() })), { onConflict: "user_id" });
    }
  }

  private async updatePhysical(existing: Row[], values: Row) {
    for (const row of existing) {
      const key = this.table === "soma_sessions" ? "token_hash" : "id";
      const updated = { ...row, ...values };
      await supabaseRequest<unknown[]>(supabasePath(this.table, [[key, `eq.${String(row[key])}`]]), { method: "PATCH", headers: new Headers({ Prefer: "return=representation" }), body: JSON.stringify(updated) });
    }
    return existing.map((row) => ({ ...row, ...values }));
  }

  private async mutate() {
    if (!this.mutation) {
      const allRows = await this.readRows();
      const from = Math.max(0, this.fromIndex);
      const to = this.toIndex === undefined ? undefined : this.toIndex + 1;
      const paged = allRows.slice(from, to).slice(0, this.maxRows);
      return this.shape(paged, allRows.length);
    }

    const mutation = this.mutation;
    if (mutation.kind === "insert" || mutation.kind === "upsert") {
      // Physical compatibility tables have their own exact schemas. In
      // particular, soma_sessions is keyed by token_hash and has no id
      // column, so do not inject the logical-row id default here.
      const rows = mutation.values.map((row) => this.isPhysicalTable() ? cleanRow(row) : withDefaults(row));
      const isUpsert = mutation.kind === "upsert";
      const onConflict = isUpsert ? mutation.onConflict : undefined;
      const ignoreDuplicates = isUpsert ? mutation.ignoreDuplicates : false;
      if (this.isPhysicalTable()) await this.insertPhysical(rows, isUpsert, onConflict, ignoreDuplicates);
      else await this.insertLogical(rows, isUpsert, onConflict, ignoreDuplicates);
      return this.shape(rows);
    }

    const existing = await this.readRows();
    if (this.isPhysicalTable()) {
      if (mutation.kind === "delete") {
        const key = this.table === "soma_sessions" ? "token_hash" : "id";
        for (const row of existing) await supabaseRequest<unknown[]>(supabasePath(this.table, [[key, `eq.${String(row[key])}`]]), { method: "DELETE", headers: new Headers({ Prefer: "return=minimal" }) });
        return this.shape(existing);
      }
      return this.shape(await this.updatePhysical(existing, mutation.values));
    }

    if (mutation.kind === "delete") {
      for (const row of existing) await supabaseRequest<unknown[]>(supabasePath("soma_rows", [["table_name", `eq.${this.table}`], ["row_key", `eq.${stableIdentity(this.table, row)}`]]), { method: "DELETE", headers: new Headers({ Prefer: "return=minimal" }) });
      return this.shape(existing);
    }

    const changed = existing.map((row) => cleanRow({ ...row, ...mutation.values, updated_at: new Date().toISOString() }));
    const persisted: Row[] = [];
    for (let index = 0; index < existing.length; index += 1) {
      const oldKey = stableIdentity(this.table, existing[index]);
      const newRow = changed[index];
      const filters = this.filters.flatMap((filter) => {
        const pair = supabaseMutationFilter(filter);
        return pair ? [pair] : [];
      });
      const updated = await supabaseRequest<unknown[]>(supabasePath("soma_rows", [["table_name", `eq.${this.table}`], ["row_key", `eq.${oldKey}`], ...filters]), {
        method: "PATCH",
        headers: new Headers({ Prefer: "return=representation" }),
        body: JSON.stringify(storageRow(this.table, newRow)),
      });
      if (updated.length > 0) persisted.push(newRow);
    }
    return this.shape(persisted);
  }

  private async execute(): Promise<QueryResult<any>> {
    try { return await this.mutate(); }
    catch (error) { return { data: null, error: { message: error instanceof Error ? error.message : "Supabase operation failed." } }; }
  }

  then<TResult1 = ManyResult, TResult2 = never>(onfulfilled?: ((value: ManyResult) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled as any, onrejected as any) as PromiseLike<TResult1 | TResult2>;
  }
}

function createSupabaseAdminClient() {
  return {
    from(table: string) { return new SupabaseQueryBuilder(table); },
    async rpc(name: string, parameters: Row) {
      const { executeCloudflareRpc } = await import("@/lib/cloudflare/rpc");
      return executeCloudflareRpc(name, parameters);
    },
    auth: {
      admin: {
        async deleteUser(userId: string) {
          try {
            await supabaseRequest<unknown[]>(supabasePath("soma_sessions", [["user_id", `eq.${userId}`]]), { method: "DELETE", headers: new Headers({ Prefer: "return=minimal" }) });
            await supabaseRequest<unknown[]>(supabasePath("soma_users", [["id", `eq.${userId}`]]), { method: "DELETE", headers: new Headers({ Prefer: "return=minimal" }) });
            await supabaseRequest<unknown[]>(supabasePath("soma_rows", [["user_id", `eq.${userId}`]]), { method: "DELETE", headers: new Headers({ Prefer: "return=minimal" }) });
            return { data: null, error: null };
          } catch (error) {
            return { data: null, error: { message: error instanceof Error ? error.message : "Account deletion failed." } };
          }
        },
      },
    },
  };
}

export function createCloudflareAdminClient() {
  return hasSupabaseRuntime() ? createSupabaseAdminClient() : createD1AdminClient();
}

export type CloudflareAdminClient = ReturnType<typeof createCloudflareAdminClient>;
