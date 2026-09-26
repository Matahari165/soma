import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

import { createD1AdminClient } from "./db-d1";
import {
  LAB_MATRIX_REVISION_TABLE,
  labMatrixRevisionStatement,
  nextSupabaseLabMatrixRevision,
  stableIdentity,
  withDefaults,
} from "./db-identity";
import {
  createSupabaseAdminClient,
  createSupabaseRequest,
  hasSupabaseRuntime,
  supabasePath,
} from "./db-supabase";
import type {
  D1BatchResult,
  D1DatabaseLike,
  Row,
  SomaCloudflareEnv,
  SupabaseRequest,
} from "./db-types";

export type { SomaCloudflareEnv } from "./db-types";
export {
  affectsLabMatrixRevision,
  labMatrixRevisionTables,
  stableIdentity,
} from "./db-identity";
export { buildCloudflareReadPlan, buildCloudflareUpdatePlan } from "./db-query";
export { hasSupabaseRuntime } from "./db-supabase";

const supabaseRequest: SupabaseRequest = createSupabaseRequest();

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

async function executeCloudflareRpc(name: string, parameters: Row) {
  const { executeCloudflareRpc: execute } = await import("@/lib/cloudflare/rpc");
  return execute(name, parameters);
}

export async function saveCloudflareJournalDay({ userId, entryDate, entries, validate, replaceOmissions }: {
  userId: string;
  entryDate: string;
  entries: Array<{ variable_id: string; value: unknown }>;
  validate: boolean;
  replaceOmissions: boolean;
}) {
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
    const revisionResult = await admin.from(LAB_MATRIX_REVISION_TABLE).upsert({ user_id: userId, revision: nextSupabaseLabMatrixRevision(), updated_at: now }, { onConflict: "user_id" });
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
  const statements = [] as ReturnType<D1DatabaseLike["prepare"]>[];

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
  assertD1BatchSucceeded(results, "Cloudflare D1 journal write failed.");

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

function assertD1BatchSucceeded(results: D1BatchResult[], fallback: string) {
  const failed = results.find((result) => result?.success === false);
  if (failed) throw new Error(failed.error ?? fallback);
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

/** Atomically counts attempts in a shared, expiring window on either runtime. */
export async function consumeAuthAttempt(key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  if (hasSupabaseRuntime()) {
    const count = await supabaseRequest<number>("rpc/consume_soma_auth_attempt", {
      method: "POST",
      body: JSON.stringify({ p_key: key, p_now_ms: now, p_window_ms: windowMs }),
    });
    return count <= limit;
  }

  const db = cloudflareDb();
  if (Math.random() < 0.01) {
    await db.prepare("DELETE FROM soma_rows WHERE table_name = 'auth_attempts' AND CAST(json_extract(json_data, '$.expires_at_ms') AS INTEGER) < ?")
      .bind(now - 86_400_000).run();
  }
  const row = JSON.stringify({ attempts: 1, expires_at_ms: now + windowMs });
  const result = await db.prepare(`
    INSERT INTO soma_rows (table_name, row_key, user_id, json_data, created_at, updated_at)
    VALUES ('auth_attempts', ?, NULL, ?, ?, ?)
    ON CONFLICT(table_name, row_key) DO UPDATE SET
      json_data = CASE
        WHEN CAST(json_extract(soma_rows.json_data, '$.expires_at_ms') AS INTEGER) <= ? THEN excluded.json_data
        ELSE json_set(soma_rows.json_data, '$.attempts', CAST(json_extract(soma_rows.json_data, '$.attempts') AS INTEGER) + 1)
      END,
      updated_at = excluded.updated_at
  `).bind(key, row, new Date(now).toISOString(), new Date(now).toISOString(), now).run();
  if (!result.success) throw new Error(result.error ?? "Auth limit storage failed.");
  const stored = await db.prepare("SELECT CAST(json_extract(json_data, '$.attempts') AS INTEGER) AS attempts FROM soma_rows WHERE table_name = 'auth_attempts' AND row_key = ?")
    .bind(key).first<{ attempts: number }>();
  if (!stored) throw new Error("Auth limit storage failed.");
  return stored.attempts <= limit;
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

/** One live database read: deleted sessions/users and expired sessions cannot authenticate. */
export async function sessionUserForHash(tokenHash: string, now: string, timeoutMs: number) {
  const rows = await supabaseRequest<Array<{ expires_at: string; user: { id: string; email: string | null; display_name: string } }>>(supabasePath("soma_sessions", [
    ["select", "expires_at,user:soma_users!inner(id,email,display_name)"],
    ["token_hash", `eq.${tokenHash}`],
    ["expires_at", `gt.${now}`],
    ["limit", "1"],
  ]), {}, timeoutMs);
  const row = rows[0];
  if (!row || !row.user || !Number.isFinite(Date.parse(row.expires_at)) || Date.parse(row.expires_at) <= Math.max(Date.parse(now), Date.now())) return null;
  return row.user;
}

function missingReadAggregate(error: unknown) {
  return error instanceof Error && /Could not find the function|function .* does not exist/i.test(error.message);
}

export async function healthDataCoverageAggregate(userId: string, dataTypes: readonly string[]) {
  if (!hasSupabaseRuntime()) return null;
  try {
    const rows = await supabaseRequest<Array<import("@/domain/health/data-coverage").HealthDataCoverage>>("rpc/soma_health_data_coverage", {
      method: "POST", body: JSON.stringify({ p_user_id: userId, p_data_types: dataTypes }),
    });
    return rows[0] ?? null;
  } catch (error) {
    // Rolling deployments remain usable until the migration is installed.
    if (missingReadAggregate(error)) return null;
    throw error;
  }
}

export async function latestHealthRecordsByType(userId: string, dataTypes: readonly string[]) {
  if (!dataTypes.length) return [] as Array<{ data_type: string; civil_date: string | null; measured_at: string | null }>;
  if (hasSupabaseRuntime()) {
    try {
      return await supabaseRequest<Array<{ data_type: string; civil_date: string | null; measured_at: string | null }>>("rpc/soma_latest_health_records", { method: "POST", body: JSON.stringify({ p_user_id: userId, p_data_types: dataTypes }) });
    } catch (error) {
      if (!missingReadAggregate(error)) throw error;
    }
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
    try {
      return await supabaseRequest<{ importedRecords: Record<string, number>; analytics: { datedRecords: number; metricDays: number; scoreRows: number } }>("rpc/soma_health_sync_diagnostics", { method: "POST", body: JSON.stringify({ p_user_id: userId, p_data_types: dataTypes }) });
    } catch (error) {
      if (!missingReadAggregate(error)) throw error;
    }
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
    try {
      const rows = await supabaseRequest<Array<{ revision: string }>>(supabasePath("soma_lab_matrix_revisions", [
        ["select", "revision"],
        ["user_id", `eq.${userId}`],
        ["limit", "1"],
      ]));
      return rows[0]?.revision ?? "0";
    } catch (error) {
      // The additive migration may not be installed yet. Keep the legacy
      // revision until the database is migrated; other errors bypass caching.
      const message = error instanceof Error ? error.message : "";
      if (!/soma_lab_matrix_revisions/i.test(message) || !/schema cache|does not exist|not found/i.test(message)) throw error;
    }
    const result = await createCloudflareAdminClient().from(LAB_MATRIX_REVISION_TABLE).select("revision").eq("user_id", userId).maybeSingle();
    if (result.error) throw new Error(result.error.message);
    const revision = result.data?.revision;
    return typeof revision === "string" && revision ? revision
      : Number.isSafeInteger(revision) && revision >= 0 ? String(revision) : "0";
  }
  const row = await cloudflareDb().prepare("SELECT json_data FROM soma_rows WHERE table_name = ? AND row_key = ? LIMIT 1")
    .bind(LAB_MATRIX_REVISION_TABLE, userId)
    .first<{ json_data: string }>();
  if (!row) return "0";
  const revision = Number((JSON.parse(row.json_data) as { revision?: unknown }).revision);
  return Number.isSafeInteger(revision) && revision >= 0 ? String(revision) : "0";
}

export function createCloudflareAdminClient() {
  const dependencies = { executeRpc: executeCloudflareRpc };
  return hasSupabaseRuntime()
    ? createSupabaseAdminClient(supabaseRequest, dependencies)
    : createD1AdminClient(cloudflareDb, dependencies);
}

export type CloudflareAdminClient = ReturnType<typeof createCloudflareAdminClient>;
